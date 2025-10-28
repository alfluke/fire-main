'use server';

import * as z from 'zod';
import { PDFDocument } from 'pdf-lib';

const formSchema = z.object({
  zpl: z.string().min(1, "ZPL code cannot be empty."),
  dpi: z.number().int(),
  width: z.number().positive(),
  height: z.number().positive(),
  orientation: z.enum(["0", "90"]),
  unit: z.enum(["in", "mm"])
});

type FormData = z.infer<typeof formSchema>;

export interface ZplRenderOutput {
  imageDataUrl: string;
  logs: string[];
  widthPx: number;
  heightPx: number;
  dpi: number;
}

function dpiToDpmm(dpi: number): number {
  switch (dpi) {
    case 203: return 8;
    case 300: return 12;
    case 600: return 24;
    default: return 8; // Default to 8 dpmm (203 dpi)
  }
}

// Function to count labels in ZPL code
function countLabelsInZPL(zpl: string): number {
    console.log(`[DEBUG] ZPL starts with: ${zpl.substring(0, 100)}...`);
    
    // NEW PRIORITY: Special case - if we find multiple ~DGR blocks, count those
    // Count the number of ~DGR command starts (this is most reliable for PDF generation)
    const dgrBlocks = (zpl.match(/~DGR:/g) || []).length;
    console.log(`[DEBUG] Found ${dgrBlocks} DGR block starts in ZPL`);
    if (dgrBlocks > 0) {
        console.log(`[DEBUG] Returning ${dgrBlocks} labels based on DGR blocks`);
        return dgrBlocks;
    }
    
    // Count ^XA commands (start of labels) - but ignore standalone ^XA in ^QA commands
    const standaloneXA = (zpl.match(/\^XA(?!\^QA|\^MMT)/g) || []).length;
    console.log(`[DEBUG] Found ${standaloneXA} standalone XA blocks`);
    if (standaloneXA > 0) {
        console.log(`[DEBUG] Returning ${standaloneXA} labels based on XA blocks`);
        return standaloneXA;
    }
    
    // Check for ^PQ command which specifies print quantity (fallback)
    const pqMatch = zpl.match(/\^PQ(\d+)/);
    if (pqMatch && pqMatch[1]) {
        const pqCount = parseInt(pqMatch[1], 10);
        console.log(`[DEBUG] Found PQ command with ${pqCount} labels`);
        return pqCount;
    }
    
    console.log(`[DEBUG] No clear label indicators found, defaulting to 1`);
    return 1;
}

// Function to split ZPL into chunks of max labels
function splitZplIntoChunks(zpl: string, maxLabelsPerChunk: number = 16): string[] {
    const dgrMatches = [...zpl.matchAll(/~DGR:/g)];
    console.log(`[SPLIT] Found ${dgrMatches.length} DGR matches, splitting into chunks of max ${maxLabelsPerChunk} labels`);
    
    const labels: string[] = [];
    for (let i = 0; i < dgrMatches.length; i++) {
        const startPos = dgrMatches[i].index!;
        const endPos = i < dgrMatches.length - 1 ? dgrMatches[i + 1].index! : zpl.length;
        
        let label = zpl.substring(startPos, endPos).trim();
        if (!label.endsWith('^XZ')) {
            label += '\n^XA^IDR:DEMO.GRF^FS^XZ';
        }
        labels.push(label);
    }
    
    // Create chunks
    const chunks: string[] = [];
    for (let i = 0; i < labels.length; i += maxLabelsPerChunk) {
        const chunk = labels.slice(i, i + maxLabelsPerChunk).join('\n\n');
        chunks.push(chunk);
        console.log(`[SPLIT] Created chunk ${chunks.length} with ${Math.min(maxLabelsPerChunk, labels.length - i)} labels`);
    }
    
    return chunks;
}

// Function to split ZPL into individual labels (1 per API call for PDF)
function splitZplIntoIndividualLabels(zpl: string): string[] {
    const dgrMatches = [...zpl.matchAll(/~DGR:/g)];
    console.log(`[SPLIT INDIVIDUAL] Found ${dgrMatches.length} DGR matches, splitting into individual labels`);
    
    const labels: string[] = [];
    for (let i = 0; i < dgrMatches.length; i++) {
        const startPos = dgrMatches[i].index!;
        const endPos = i < dgrMatches.length - 1 ? dgrMatches[i + 1].index! : zpl.length;
        
        let label = zpl.substring(startPos, endPos).trim();
        
        // Ensure each label is complete and properly formed
        if (!label.includes('^XA')) {
            label = '^XA' + label;
        }
        if (!label.includes('^XZ')) {
            label = label + '^XZ';
        }
        
        labels.push(label);
        console.log(`[SPLIT INDIVIDUAL] Label ${i + 1}: ${label.substring(0, 50)}...`);
    }
    
    return labels;
}

// Random User-Agent pool to diversify requests
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 Version/16.5 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
    'Mozilla/5.0 (iPad; CPU OS 16_4 like Mac OS X) AppleWebKit/605.1.15 Version/16.4 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0'
];

// Parse optional proxy/base URL pool for Labelary. You can set LABELARY_BASE_URLS
// as a comma-separated list of reverse-proxy endpoints that forward to Labelary.
// Example: https://proxy-a.example.com,https://proxy-b.example.com
// In development, if not provided, prefer local proxy first for easier testing.
const inferredDefaultBase = (process.env.NODE_ENV !== 'production')
    ? 'http://127.0.0.1:9002,https://api.labelary.com'
    : 'https://api.labelary.com';
const LABELARY_BASE_URLS: string[] = (process.env.LABELARY_BASE_URLS || inferredDefaultBase)
    .split(',')
    .map(u => u.trim())
    .filter(Boolean);

// Debug log
console.log(`[LABELARY] NODE_ENV=${process.env.NODE_ENV}, Using bases:`, LABELARY_BASE_URLS);

function pickUserAgent(seed: number): string {
    return USER_AGENTS[seed % USER_AGENTS.length];
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function computeBackoff(attempt: number, baseMs: number): number {
    const jitter = Math.floor(Math.random() * 250);
    return Math.min(8000, Math.floor(baseMs * Math.pow(2, attempt)) + jitter);
}

// Global concurrency limiter for Labelary requests (process-wide)
const MAX_LABELARY_CONCURRENCY: number = Math.max(
    1,
    parseInt(process.env.LABELARY_MAX_CONCURRENCY || '4', 10)
);
let inFlightLabelaryRequests = 0;
const labelaryWaitQueue: Array<() => void> = [];

async function acquireLabelarySlot(): Promise<void> {
    if (inFlightLabelaryRequests < MAX_LABELARY_CONCURRENCY) {
        inFlightLabelaryRequests += 1;
        return;
    }
    await new Promise<void>(resolve => labelaryWaitQueue.push(resolve));
    inFlightLabelaryRequests += 1;
}

function releaseLabelarySlot(): void {
    inFlightLabelaryRequests = Math.max(0, inFlightLabelaryRequests - 1);
    const next = labelaryWaitQueue.shift();
    if (next) next();
}

// Default timeout for calls to Labelary (ms)
const LABELARY_FETCH_TIMEOUT_MS: number = Math.max(
    1000,
    parseInt(process.env.LABELARY_FETCH_TIMEOUT_MS || '25000', 10)
);

async function fetchLabelary(
    data: FormData,
    format: 'png' | 'pdf',
    labelIndex?: number,
    apiInstanceId: number = 1
): Promise<ArrayBuffer> {
    const { zpl, dpi, width, height, orientation, unit } = data;

    // Debug and validate all parameters
    console.log(`[LABELARY] DEBUG - Instance ${apiInstanceId} parameters:`, {
        zpl: zpl ? `${zpl.length} chars` : 'UNDEFINED',
        dpi: dpi || 'UNDEFINED',
        width: width || 'UNDEFINED', 
        height: height || 'UNDEFINED',
        orientation: orientation || 'UNDEFINED',
        unit: unit || 'UNDEFINED'
    });

    // Provide defaults for undefined values
    const safeUnit = unit || 'inch';
    const safeWidth = width || '4';
    const safeHeight = height || '6';
    const safeOrientation = orientation || '0';
    
    const widthIn = safeUnit === 'mm' ? parseFloat(safeWidth) / 25.4 : parseFloat(safeWidth);
    const heightIn = safeUnit === 'mm' ? parseFloat(safeHeight) / 25.4 : parseFloat(safeHeight);
    
    const dpmm = dpiToDpmm(dpi || 203);
    const orientationValue = safeOrientation === '90' ? 1 : 0;
    
    // Build path part once
    const path = `/v1/printers/${dpmm}dpmm/labels/${widthIn}x${heightIn}/${orientationValue}`
        + (format === 'png' && labelIndex !== undefined ? `/${labelIndex}` : '');

    // We will retry on 429/5xx with exponential backoff and rotate base URLs
    const maxAttempts = 5;
    const baseDelay = 350 + (apiInstanceId * 75); // slight staggering per instance

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const baseIndex = (apiInstanceId - 1 + attempt) % LABELARY_BASE_URLS.length;
        const baseUrl = LABELARY_BASE_URLS[baseIndex].replace(/\/$/, '');
        const url = `${baseUrl}${path}`;

        const headers: Record<string, string> = {
            'Accept': format === 'pdf' ? 'application/pdf' : 'image/png',
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': pickUserAgent(apiInstanceId + attempt),
            'X-API-Instance': `Fire-Studio-Instance-${apiInstanceId}`,
            'X-Request-Priority': apiInstanceId === 1 ? 'high' : 'normal'
        };

        console.log(`[LABELARY] Instance ${apiInstanceId} attempt ${attempt + 1}/${maxAttempts} -> ${url.substring(0, 120)}...`);

        // Concurrency guard + abortable fetch with timeout
        await acquireLabelarySlot();
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), LABELARY_FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: zpl || '',
                signal: abortController.signal
            });

            if (response.ok) {
                console.log(`[LABELARY] ✅ Instance ${apiInstanceId} succeeded on attempt ${attempt + 1}`);
                return await response.arrayBuffer();
            }

            const status = response.status;
            let retryAfterMs = 0;
            const retryAfter = response.headers.get('retry-after');
            if (retryAfter) {
                const parsed = parseInt(retryAfter, 10);
                if (!Number.isNaN(parsed)) retryAfterMs = parsed * 1000;
            }
            const text = await response.text().catch(() => '');
            console.warn(`[LABELARY] ⚠️ Instance ${apiInstanceId} attempt ${attempt + 1} failed: ${status} - ${text?.slice(0, 180)}...`);

            if (status === 429 || (status >= 500 && status < 600)) {
                const delay = Math.max(retryAfterMs, computeBackoff(attempt, baseDelay));
                console.warn(`[LABELARY] ⏳ Backing off for ${delay}ms before retry (rotate base URL)`);
                await sleep(delay);
                continue;
            }

            // Non-retryable
            throw new Error(`Labelary API Error: ${status} - ${text}`);
        } catch (err) {
            if ((err as Error)?.name === 'AbortError') {
                console.warn(`[LABELARY] ⏱️ Timeout after ${LABELARY_FETCH_TIMEOUT_MS}ms on attempt ${attempt + 1}`);
                // Treat as retryable similar to 5xx
                const delay = computeBackoff(attempt, baseDelay);
                await sleep(delay);
                continue;
            }
            throw err;
        } finally {
            clearTimeout(timeoutId);
            releaseLabelarySlot();
        }
    }

    throw new Error('Labelary API Error: Exhausted retries due to rate limiting. Please try again later.');
}

export async function renderZplAction(data: FormData, labelIndex: number): Promise<string> {
    const labelCount = countLabelsInZPL(data.zpl);
    
    // If we have many labels (>16), we need to render them differently
    if (labelCount > 16) {
        console.log(`[RENDER] Large dataset (${labelCount} labels), splitting for preview`);
        
        // Split into chunks and get the specific label
        const chunks = splitZplIntoChunks(data.zpl, 16);
        let currentChunkIndex = 0;
        let labelIndexInChunk = labelIndex;
        
        // Find which chunk contains our target label
        for (let i = 0; i < chunks.length; i++) {
            const chunkLabelCount = countLabelsInZPL(chunks[i]);
            if (labelIndexInChunk <= chunkLabelCount) {
                currentChunkIndex = i;
                break;
            }
            labelIndexInChunk -= chunkLabelCount;
        }
        
        const chunkData = { ...data, zpl: chunks[currentChunkIndex] };
        const imageBuffer = await fetchLabelary(chunkData, 'png', labelIndexInChunk);
        const base64Image = Buffer.from(imageBuffer).toString('base64');
        return `data:image/png;base64,${base64Image}`;
    } else {
        // Normal rendering for small datasets
        const imageBuffer = await fetchLabelary(data, 'png', labelIndex);
        const base64Image = Buffer.from(imageBuffer).toString('base64');
        return `data:image/png;base64,${base64Image}`;
    }
}

export async function downloadPdfAction(data: FormData): Promise<string> {
    // Use ONLY the individual labels approach - ALWAYS works
    return downloadPdfActionIndividualLabels(data);
}

export async function downloadPdfActionIndividualLabels(data: FormData): Promise<string> {
    const labelCount = countLabelsInZPL(data.zpl);
    console.log(`[PDF INDIVIDUAL] Processing ${labelCount} labels - ONE API CALL PER LABEL`);

    if (labelCount === 1) {
        // Single label - simple processing
        console.log(`[PDF INDIVIDUAL] Single label - simple processing`);
        const pdfBuffer = await fetchLabelary(data, 'pdf'); 
        const base64Pdf = Buffer.from(pdfBuffer).toString('base64');
        return `data:application/pdf;base64,${base64Pdf}`;
    }

    try {
        // Split into individual labels - ONE label per API call
        const labels = splitZplIntoIndividualLabels(data.zpl);
        console.log(`[PDF INDIVIDUAL] Split into ${labels.length} individual labels`);
        
        const pdfBuffers: ArrayBuffer[] = [];

        // MULTI-REQUEST WORKER SYSTEM: Create dedicated API instances per request
        console.log(`[PDF INDIVIDUAL] WORKER SYSTEM: Processing ${labels.length} labels with dedicated instances`);
        
        // Create unique API pool for this specific request
        const requestId = Date.now() + Math.random();
        const apiPoolSize = Math.min(3, Math.max(1, Math.floor(labels.length / 10))); // Scale API pool by request size
        const apiInstances = Array.from({ length: apiPoolSize }, (_, i) => ({
            id: i + 1,
            inUse: false,
            requestId: requestId,
            lastUsed: 0
        }));
        
        console.log(`[PDF INDIVIDUAL] Created ${apiPoolSize} dedicated API instances for request ${requestId}`);
        
        // OPTIMIZED WORKER PROCESSING: Process in small batches for maximum speed
        const batchSize = 2; // Process 2 labels simultaneously 
        const batches = [];
        for (let i = 0; i < labels.length; i += batchSize) {
            batches.push(labels.slice(i, i + batchSize));
        }

        console.log(`[PDF INDIVIDUAL] Processing ${batches.length} optimized batches of ${batchSize} labels`);

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            
            console.log(`[PDF INDIVIDUAL] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} labels in parallel)`);

            // Process batch in parallel
            const batchPromises = batch.map(async (label, batchLabelIndex) => {
                const labelIndex = (batchIndex * batchSize) + batchLabelIndex;
                const selectedAPI = apiInstances[labelIndex % apiInstances.length];
                
                selectedAPI.inUse = true;
                selectedAPI.lastUsed = Date.now();
                
                console.log(`[PDF INDIVIDUAL] Processing label ${labelIndex + 1}/${labels.length} via API Instance ${selectedAPI.id}`);
                
                try {
                    const labelData = { ...data, zpl: label };
                    const pdfBuffer = await fetchLabelary(labelData, 'pdf', undefined, selectedAPI.id);
                    
                    console.log(`[PDF INDIVIDUAL] ✅ Label ${labelIndex + 1} completed via API ${selectedAPI.id}`);
                    return pdfBuffer;
                    
                } catch (error) {
                    console.warn(`[PDF INDIVIDUAL] ❌ Label ${labelIndex + 1} failed via API ${selectedAPI.id}:`, (error as Error)?.message);
                    if (error.message.includes('429')) {
                        console.warn(`[PDF INDIVIDUAL] Rate limit on API ${selectedAPI.id}, adding extra delay...`);
                        await new Promise(resolve => setTimeout(resolve, selectedAPI.id * 1000));
                        // Retry once
                        const labelData = { ...data, zpl: label };
                        return await fetchLabelary(labelData, 'pdf', undefined, selectedAPI.id);
                    } else {
                        throw error;
                    }
                } finally {
                    selectedAPI.inUse = false;
                }
            });

            const batchResults = await Promise.all(batchPromises);
            pdfBuffers.push(...batchResults);

            // Short delay between batches
            if (batchIndex < batches.length - 1) {
                const batchDelay = 300; // Reduced batch delay
                console.log(`[PDF INDIVIDUAL] Batch ${batchIndex + 1} completed, waiting ${batchDelay}ms before next batch...`);
                await new Promise(resolve => setTimeout(resolve, batchDelay));
            }
        }
        
        console.log(`[PDF INDIVIDUAL] All API instances released for request ${requestId}`);
        
        // Ultra-fast PDF combining with optimized memory usage
        console.log(`[PDF INDIVIDUAL] All labels processed. Now ultra-fast combining ${pdfBuffers.length} PDFs...`);
        const mergedPdf = await PDFDocument.create();
        
        // Process in larger batches for maximum speed
        const mergeBatchSize = labels.length > 30 ? 20 : 15;
        
        for (let i = 0; i < pdfBuffers.length; i += mergeBatchSize) {
            const batchEnd = Math.min(i + mergeBatchSize, pdfBuffers.length);
            console.log(`[PDF INDIVIDUAL] Merging super-batch ${Math.floor(i/mergeBatchSize) + 1}/${Math.ceil(pdfBuffers.length/mergeBatchSize)} (PDFs ${i + 1}-${batchEnd})`);
            
            // Process each PDF in the batch
            const mergePromises = [];
            for (let j = i; j < batchEnd; j++) {
                mergePromises.push(PDFDocument.load(pdfBuffers[j]));
            }
            
            // Load all PDFs in this batch simultaneously
            const loadedPdfs = await Promise.all(mergePromises);
            
            // Add all pages to merged PDF
            for (const pdf of loadedPdfs) {
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
            }
        }
        
        console.log(`[PDF INDIVIDUAL] Final PDF created with ${mergedPdf.getPageCount()} pages (should be ${labels.length})`);
        const mergedPdfBytes = await mergedPdf.save();
        const base64Pdf = Buffer.from(mergedPdfBytes).toString('base64');
        return `data:application/pdf;base64,${base64Pdf}`;
        
    } catch (error) {
        console.warn(`[PDF INDIVIDUAL] Error processing individual labels:`, error);
        throw new Error(`Unable to process ${labelCount} labels individually: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}