'use server';

import * as z from 'zod';
import { PDFDocument } from 'pdf-lib';
import { createHash } from 'crypto';

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

// Simple in-memory LRU cache for Labelary responses (per-process/session)
type CacheEntry = { ts: number; value: ArrayBuffer };
const LABELARY_CACHE_MAX_SIZE = Math.max(16, parseInt(process.env.LABELARY_CACHE_MAX_SIZE || '256', 10));
const labelaryCache: Map<string, CacheEntry> = new Map();

function getLabelaryCacheKey(
    data: FormData,
    format: 'png' | 'pdf',
    labelIndex?: number
): string {
    const hash = createHash('sha1').update(data.zpl || '').digest('hex');
    return [
        'v1', // bump when key schema changes
        format,
        labelIndex ?? 'all',
        data.dpi,
        data.width,
        data.height,
        data.orientation,
        data.unit,
        hash
    ].join(':');
}

function lruGet(key: string): ArrayBuffer | undefined {
    const entry = labelaryCache.get(key);
    if (!entry) return undefined;
    // move to recent
    labelaryCache.delete(key);
    labelaryCache.set(key, entry);
    return entry.value;
}

function lruSet(key: string, value: ArrayBuffer): void {
    if (labelaryCache.has(key)) labelaryCache.delete(key);
    labelaryCache.set(key, { ts: Date.now(), value });
    if (labelaryCache.size > LABELARY_CACHE_MAX_SIZE) {
        // delete least-recently used (first key)
        const firstKey = labelaryCache.keys().next().value as string | undefined;
        if (firstKey) labelaryCache.delete(firstKey);
    }
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

    // We will retry on 429/5xx/network timeouts with exponential backoff and rotate base URLs
    const maxAttempts = Math.max(1, parseInt(process.env.LABELARY_MAX_ATTEMPTS || '6', 10));
    const baseDelay = 350 + (apiInstanceId * 75); // slight staggering per instance

    // Cache fast-path
    const cacheKey = getLabelaryCacheKey(data, format, labelIndex);
    const cached = lruGet(cacheKey);
    if (cached) {
        console.log(`[LABELARY] 🔁 Cache hit for ${format} idx=${labelIndex ?? 'all'}`);
        return cached.slice(0) as ArrayBuffer; // return a copy-ish (ArrayBuffer is transferable; slice clones)
    }

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
                const buf = await response.arrayBuffer();
                try { lruSet(cacheKey, buf); } catch {}
                return buf;
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
            const name = (err as Error)?.name || '';
            const message = (err as Error)?.message || '';
            if (name === 'AbortError' || /fetch failed|network|ETIMEDOUT|ECONNRESET|EAI_AGAIN/i.test(message)) {
                console.warn(`[LABELARY] 🌐 Network error on attempt ${attempt + 1}: ${name || ''} ${message || ''}`);
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
    // Estratégia adaptativa: para conjuntos grandes, gerar PDF a partir de PNGs (mais leve)
    const labelCount = countLabelsInZPL(data.zpl);
    const forceMode = (process.env.LABELARY_PDF_BUILD_MODE || '').toLowerCase();

    if (forceMode === 'png') {
        return downloadPdfActionFromPngs(data);
    }

    if (labelCount > 35) {
        // Mais eficiente montar via PNG quando há muitas páginas
        return downloadPdfActionFromPngs(data);
    }

    // Default: abordagem por PDFs individuais (robusta)
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

        // Deduplicate identical labels to minimize API calls
        const uniqueLabelMap = new Map<string, number>();
        const uniqueLabels: string[] = [];
        const originalToUnique: number[] = new Array(labels.length);
        for (let i = 0; i < labels.length; i++) {
            const key = createHash('sha1').update(labels[i]).digest('hex');
            if (!uniqueLabelMap.has(key)) {
                uniqueLabelMap.set(key, uniqueLabels.length);
                uniqueLabels.push(labels[i]);
            }
            originalToUnique[i] = uniqueLabelMap.get(key)!;
        }
        console.log(`[PDF INDIVIDUAL] Deduplicated ${labels.length} -> ${uniqueLabels.length} unique labels`);

        const uniquePdfBuffers: ArrayBuffer[] = [];

        // MULTI-REQUEST WORKER SYSTEM: Create dedicated API instances per request
        console.log(`[PDF INDIVIDUAL] WORKER SYSTEM: Processing ${labels.length} labels with dedicated instances`);
        
        // Create unique API pool for this specific request
        const requestId = Date.now() + Math.random();
        // Allow tuning via env vars
        const API_POOL_SIZE_MAX = Math.max(1, parseInt(process.env.LABELARY_API_POOL_SIZE_MAX || '4', 10));
        const apiPoolSize = Math.min(API_POOL_SIZE_MAX, Math.max(1, Math.ceil(labels.length / 12))); // scale with cap
        const apiInstances = Array.from({ length: apiPoolSize }, (_, i) => ({
            id: i + 1,
            inUse: false,
            requestId: requestId,
            lastUsed: 0
        }));
        
        console.log(`[PDF INDIVIDUAL] Created ${apiPoolSize} dedicated API instances for request ${requestId}`);
        
        // OPTIMIZED WORKER PROCESSING: Process in small batches for maximum speed
        const batchSize = Math.max(1, parseInt(process.env.LABELARY_PDF_BATCH_SIZE || '3', 10)); // tuneable parallelism per batch
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
            uniquePdfBuffers.push(...batchResults);

            // Short delay between batches
            if (batchIndex < batches.length - 1) {
                const batchDelay = Math.max(50, parseInt(process.env.LABELARY_BATCH_DELAY_MS || '150', 10));
                console.log(`[PDF INDIVIDUAL] Batch ${batchIndex + 1} completed, waiting ${batchDelay}ms before next batch...`);
                await new Promise(resolve => setTimeout(resolve, batchDelay));
            }
        }
        
        console.log(`[PDF INDIVIDUAL] All API instances released for request ${requestId}`);
        
        // Ultra-fast PDF combining with optimized memory usage
        console.log(`[PDF INDIVIDUAL] All unique labels processed. Now ultra-fast combining ${uniquePdfBuffers.length} PDFs...`);
        const mergedPdf = await PDFDocument.create();
        
        // Process in larger batches for maximum speed
        const mergeBatchSize = labels.length > 30 ? 20 : 15;
        
        for (let i = 0; i < uniquePdfBuffers.length; i += mergeBatchSize) {
            const batchEnd = Math.min(i + mergeBatchSize, uniquePdfBuffers.length);
            console.log(`[PDF INDIVIDUAL] Merging super-batch ${Math.floor(i/mergeBatchSize) + 1}/${Math.ceil(uniquePdfBuffers.length/mergeBatchSize)} (PDFs ${i + 1}-${batchEnd})`);
            
            // Process each PDF in the batch
            const mergePromises = [];
            for (let j = i; j < batchEnd; j++) {
                mergePromises.push(PDFDocument.load(uniquePdfBuffers[j]));
            }
            
            // Load all PDFs in this batch simultaneously
            const loadedPdfs = await Promise.all(mergePromises);
            
            // Add all pages to merged PDF
            for (const pdf of loadedPdfs) {
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
            }
        }
        
        // Reconstruct final PDF pages repeating pages according to originalToUnique mapping
        // We already built merged unique pages; now if there are duplicates, we need to expand.
        // Simpler approach: if no duplicates, proceed; if duplicates, rebuild by copying pages in order.
        if (uniqueLabels.length === labels.length) {
            console.log(`[PDF INDIVIDUAL] Final PDF created with ${mergedPdf.getPageCount()} pages (should be ${labels.length})`);
            const mergedPdfBytes = await mergedPdf.save();
            const base64Pdf = Buffer.from(mergedPdfBytes).toString('base64');
            return `data:application/pdf;base64,${base64Pdf}`;
        }

        // Duplicate scenario: expand pages in order
        const expanded = await PDFDocument.create();
        const sourcePages = await mergedPdf.copyPages(mergedPdf, mergedPdf.getPageIndices());
        for (const uIdx of originalToUnique) {
            const page = sourcePages[uIdx];
            expanded.addPage(page);
        }
        console.log(`[PDF INDIVIDUAL] Final PDF created with ${expanded.getPageCount()} pages after expanding duplicates`);
        const expandedBytes = await expanded.save();
        const base64Expanded = Buffer.from(expandedBytes).toString('base64');
        return `data:application/pdf;base64,${base64Expanded}`;
        
    } catch (error) {
        console.warn(`[PDF INDIVIDUAL] Error processing individual labels:`, error);
        // Fallback: try PNG-based builder with safer parameters when rate limited
        const msg = (error instanceof Error ? error.message : String(error)) || '';
        if (/429|rate limit|Exhausted retries/i.test(msg)) {
            const prevBatch = process.env.LABELARY_PDF_BATCH_SIZE;
            const prevDelay = process.env.LABELARY_BATCH_DELAY_MS;
            try {
                process.env.LABELARY_PDF_BATCH_SIZE = '1';
                process.env.LABELARY_BATCH_DELAY_MS = '350';
                console.warn(`[PDF INDIVIDUAL] Falling back to PNG mode with conservative batching...`);
                return await downloadPdfActionFromPngs(data);
            } finally {
                if (prevBatch !== undefined) process.env.LABELARY_PDF_BATCH_SIZE = prevBatch;
                if (prevDelay !== undefined) process.env.LABELARY_BATCH_DELAY_MS = prevDelay;
            }
        }
        throw new Error(`Unable to process ${labelCount} labels individually: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function downloadPdfActionFromPngs(data: FormData): Promise<string> {
    const labels = splitZplIntoIndividualLabels(data.zpl);
    console.log(`[PDF PNG] Building PDF from ${labels.length} PNGs`);

    // Deduplicate identical labels to minimize API calls
    const uniqueLabelMap = new Map<string, number>();
    const uniqueLabels: string[] = [];
    const originalToUnique: number[] = new Array(labels.length);
    for (let i = 0; i < labels.length; i++) {
        const key = createHash('sha1').update(labels[i]).digest('hex');
        if (!uniqueLabelMap.has(key)) {
            uniqueLabelMap.set(key, uniqueLabels.length);
            uniqueLabels.push(labels[i]);
        }
        originalToUnique[i] = uniqueLabelMap.get(key)!;
    }
    console.log(`[PDF PNG] Deduplicated ${labels.length} -> ${uniqueLabels.length} unique labels`);

    const requestId = Date.now() + Math.random();
    const API_POOL_SIZE_MAX = Math.max(1, parseInt(process.env.LABELARY_API_POOL_SIZE_MAX || '4', 10));
    const apiPoolSize = Math.min(API_POOL_SIZE_MAX, Math.max(1, Math.ceil(labels.length / 12)));
    const batchSize = Math.max(1, parseInt(process.env.LABELARY_PDF_BATCH_SIZE || '3', 10));
    const batchDelay = Math.max(50, parseInt(process.env.LABELARY_BATCH_DELAY_MS || '150', 10));
    const apiInstances = Array.from({ length: apiPoolSize }, (_, i) => ({ id: i + 1 }));

    // Dimensões físicas da página em pontos (72 pt = 1 in)
    const unit = data.unit || 'in';
    const wIn = unit === 'mm' ? (data.width / 25.4) : data.width;
    const hIn = unit === 'mm' ? (data.height / 25.4) : data.height;
    const pageW = Math.max(1, Math.round(wIn * 72));
    const pageH = Math.max(1, Math.round(hIn * 72));

    const pdf = await PDFDocument.create();

    // Processar em lotes paralelos
    const batches: string[][] = [];
    for (let i = 0; i < uniqueLabels.length; i += batchSize) {
        batches.push(uniqueLabels.slice(i, i + batchSize));
    }

    console.log(`[PDF PNG] request ${requestId} | apiPool=${apiPoolSize} batchSize=${batchSize} batches=${batches.length}`);

    // Pre-allocate embedded images for each unique label
    const embeddedImgs: any[] = new Array(uniqueLabels.length);

    for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        const batchStart = b * batchSize;
        const results = await Promise.all(batch.map(async (label, idx) => {
            const labelData = { ...data, zpl: label };
            // Distribui a carga entre instâncias para melhor paralelismo e menos 429
            const instance = apiInstances[(batchStart + idx) % apiInstances.length];
            const buf = await fetchLabelary(labelData, 'png', undefined, instance.id);
            return buf;
        }));

        for (let i = 0; i < results.length; i++) {
            const pngBytes = new Uint8Array(results[i]);
            embeddedImgs[batchStart + i] = await pdf.embedPng(pngBytes);
        }

        if (b < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
    }

    // Append pages in original order (expand duplicates)
    for (let i = 0; i < labels.length; i++) {
        const uIdx = originalToUnique[i];
        const img = embeddedImgs[uIdx];
        const page = pdf.addPage([pageW, pageH]);
        const scale = Math.min(pageW / img.width, pageH / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const x = (pageW - drawW) / 2;
        const y = (pageH - drawH) / 2;
        page.drawImage(img, { x, y, width: drawW, height: drawH });
    }

    const out = await pdf.save();
    return `data:application/pdf;base64,${Buffer.from(out).toString('base64')}`;
}