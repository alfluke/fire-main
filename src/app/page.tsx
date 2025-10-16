"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Download, FileText, Bot, Grid, ZoomIn, ZoomOut, Redo, Eraser } from "lucide-react";
import { saveAs } from "file-saver";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

import {
  EXAMPLE_ZPL, DPI_OPTIONS, UNIT_OPTIONS, DEFAULT_DPI, DEFAULT_WIDTH,
  DEFAULT_HEIGHT, DEFAULT_UNIT,
} from "@/lib/constants";
import { renderZplAction, downloadPdfAction, downloadPdfActionIndividualLabels } from "./actions";
import { debugZplLabels } from "./debug-actions";

const formSchema = z.object({
  zpl: z.string().min(1, "ZPL code cannot be empty."),
  dpi: z.number().int(),
  width: z.number().positive(),
  height: z.number().positive(),
  unit: z.enum(["in", "mm"]),
  orientation: z.enum(["0", "90"]),
});

type FormData = z.infer<typeof formSchema>;
export interface ZplRenderOutput {
  imageDataUrl: string;
  widthPx: number;
  heightPx: number;
  logs: string[];
  orientation: '0' | '90';
  dpi: number;
}


export default function ZplPlayground() {
  const { toast } = useToast();
  const { username } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [renderResult, setRenderResult] = useState<ZplRenderOutput | null>(null);
  const [zoom, setZoom] = useState(2);
  const [showGrid, setShowGrid] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentLabelIndex, setCurrentLabelIndex] = useState(1);
  const [totalLabels, setTotalLabels] = useState(1);
  const [debugInfo, setDebugInfo] = useState<{
    dgrCount: number;
    pqCount: number;
    xaCount: number;
    recommendedCount: number;
  } | null>(null);
  const [isProcessingLarge, setIsProcessingLarge] = useState(false);

  const { control, handleSubmit, getValues, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      zpl: EXAMPLE_ZPL,
      dpi: DEFAULT_DPI,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      unit: DEFAULT_UNIT,
      orientation: "0",
    },
  });

  const zplValue = watch("zpl");

  const countLabels = useCallback((zpl: string) => {
    // Count ^XA commands (start of labels) - but ignore standalone ^XA in ^QA commands
    const standaloneXA = (zpl.match(/\^XA(?!\^QA|\^MMT)/g) || []).length;
    if (standaloneXA > 0) {
      return standaloneXA;
    }
    
    // Check for ^PQ command which specifies print quantity (fallback)
    const pqMatch = zpl.match(/\^PQ(\d+)/);
    if (pqMatch && pqMatch[1]) {
      return parseInt(pqMatch[1], 10);
    }
    
    return 1;
  }, []);

  useEffect(() => {
    const labelCount = countLabels(zplValue);
    setTotalLabels(labelCount > 0 ? labelCount : 1);
    if (currentLabelIndex > (labelCount || 1)) {
        setCurrentLabelIndex(1);
    }
  }, [zplValue, countLabels, currentLabelIndex]);


  useEffect(() => {
    if (errors.zpl) toast({ title: "Validation Error", description: errors.zpl.message, variant: "destructive" });
    if (errors.width) toast({ title: "Validation Error", description: "Width must be a positive number.", variant: "destructive" });
    if (errors.height) toast({ title: "Validation Error", description: "Height must be a positive number.", variant: "destructive" });
  }, [errors, toast]);

  const handleRender = useCallback(async (data: FormData, labelIndex: number = 1) => {
    setIsLoading(true);
    setRenderResult(null);
    setCurrentLabelIndex(1); // Always show first label only

    try {
        // Always render only the first label for preview
        const result = await renderZplAction(data, 1);
        const { width, height, unit, dpi, orientation } = data;
        const currentTotalLabels = countLabels(data.zpl);
        
        // Calculate actual size first, then scale for preview
        let actualWidthPx, actualHeightPx;
        if (unit === 'in') {
            actualWidthPx = width * dpi;
            actualHeightPx = height * dpi;
        } else { // mm
            actualWidthPx = (width / 25.4) * dpi;
            actualHeightPx = (height / 25.4) * dpi;
        }

        // Scale down for preview but maintain aspect ratio
        const maxPreviewSize = 400; // Maximum preview size
        const scale = Math.min(maxPreviewSize / actualWidthPx, maxPreviewSize / actualHeightPx, 1);
        
        const widthPx = actualWidthPx * scale;
        const heightPx = actualHeightPx * scale;

        let finalWidthPx = widthPx;
        let finalHeightPx = heightPx;
        if (orientation === '90') {
            finalWidthPx = heightPx;
            finalHeightPx = widthPx;
        }

        setRenderResult({
            imageDataUrl: result,
            widthPx: finalWidthPx,
            heightPx: finalHeightPx,
            logs: [`Preview: First label of ${currentTotalLabels} total labels (reduced size for better viewing)`],
            orientation: orientation,
            dpi: dpi
        });
    } catch (error) {
        let message = "An unknown error occurred.";
        if (error instanceof Error) {
            message = error.message;
        }
        toast({
            title: "Render Failed",
            description: message,
            variant: "destructive",
        });
        setRenderResult((prev) => ({
            ...(prev ?? {
                imageDataUrl: "",
                widthPx: 0,
                heightPx: 0,
                logs: [],
                orientation: data.orientation,
                dpi: data.dpi,
            }),
            logs: [...((prev?.logs) || []), message],
        }));
    }
    setIsLoading(false);
  }, [toast, countLabels, renderResult]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setValue("zpl", content);
        toast({ title: "File Loaded", description: `${file.name} loaded successfully.` });
      };
      reader.readAsText(file);
    }
    event.target.value = ''; // Reset file input
  };
  
  const handleDownload = async (format: 'png' | 'pdf') => {
    const formData = getValues();
    if (!formData.zpl) {
      toast({ title: "Nothing to download", description: "Please enter ZPL code first.", variant: "destructive" });
      return;
    }

    if (format === 'png') {
        if (!renderResult) {
            toast({ title: "Nothing to download", description: "Please render a label first.", variant: "destructive" });
            return;
        }
        saveAs(renderResult.imageDataUrl, `label-${currentLabelIndex}.png`);
    } else {
        setIsDownloadingPdf(true);
        
        // Check if this is a large dataset
        const labelCount = debugInfo?.recommendedCount || 1;
        if (labelCount > 25) {
            setIsProcessingLarge(true);
            toast({ 
                title: "Large Dataset Processing", 
                description: `🎯 Processing ${labelCount} labels in batches to avoid 2MB limit. This may take ${Math.ceil(labelCount/10) * 3} seconds...`,
                duration: 5000 
            });
        }
        
        try {
            // Always uses individual approach now (downloadPdfAction calls downloadPdfActionIndividualLabels)
            console.log(`[UI] Label count: ${labelCount}, processing in INDIVIDUAL mode`);
            const pdfDataUrl = await downloadPdfAction(formData);
            saveAs(pdfDataUrl, `labels-${labelCount}-pages.pdf`);
            
            toast({
                title: "✅ PDF Generated Successfully!",
                description: `Generated PDF with ${labelCount} labels using optimized individual processing`,
            });
        } catch (error) {
            let message = "An unknown error occurred while generating the PDF.";
            if (error instanceof Error) {
                message = error.message;
            }
            toast({
                title: "PDF Download Failed",
                description: message,
                variant: "destructive",
            });
        } finally {
            setIsDownloadingPdf(false);
            setIsProcessingLarge(false);
        }
    }
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !renderResult?.imageDataUrl) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const img = new Image();
    img.onload = () => {
      // Use the actual image dimensions for the canvas
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Clear and draw the image at full size
      ctx.clearRect(0, 0, img.width, img.height);
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, img.width, img.height);
      ctx.drawImage(img, 0, 0);

      if (showGrid) {
        ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
        ctx.lineWidth = 1;
        const gridSize = renderResult.dpi; // 1 inch grid

        for (let x = gridSize; x < img.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, img.height);
            ctx.stroke();
        }
        for (let y = gridSize; y < img.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(img.width, y);
            ctx.stroke();
        }
      }
    };
    img.src = renderResult.imageDataUrl;
  }, [renderResult, showGrid]);
  
  const { width: currentWidth, height: currentHeight, unit: currentUnit, dpi: currentDpi } = getValues();
  const physicalWidth = currentUnit === 'mm' ? currentWidth.toFixed(1) : currentWidth.toFixed(2);
  const physicalHeight = currentUnit === 'mm' ? currentHeight.toFixed(1) : currentHeight.toFixed(2);

  const onRenderSubmit = (data: FormData) => {
    handleRender(data, 1);
  };


  const handleDebugLabels = async () => {
    const zplValue = getValues().zpl;
    if (!zplValue) {
      toast({ title: "No ZPL code", description: "Please enter ZPL code first.", variant: "destructive" });
      return;
    }
    
    const debugResults = await debugZplLabels(zplValue);
    setDebugInfo(debugResults);
    toast({ title: "Debug Completed", description: `Found ${debugResults.recommendedCount} labels. Check server console for details.` });
  };


  return (
    <TooltipProvider>
      <div className="container mx-auto p-4 md:p-8 h-full">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
          {/* Controls Panel */}
          <Card className="lg:col-span-1 flex flex-col">
            <CardHeader>
              <CardTitle>ZPL Controls</CardTitle>
              <CardDescription>Configure and render your ZPL label.</CardDescription>
              
              {/* Debug Info Display */}
              {debugInfo && (
                <div className="mt-3 p-3 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">Label Analysis:</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                    <div>DGR Commands: <span className="font-bold text-green-600">{debugInfo.dgrCount}</span></div>
                    <div>PQ Commands: <span className="font-bold text-blue-600">{debugInfo.pqCount}</span></div>
                    <div>XA Commands: <span className="font-bold text-purple-600">{debugInfo.xaCount}</span></div>
                    <div>Recommended: <span className="font-bold text-red-600">{debugInfo.recommendedCount}</span></div>
                  </div>
                  
                  {/* Processing Info */}
                  {debugInfo.recommendedCount > 25 && (
                    <div className="p-2 bg-orange-50 border border-orange-200 rounded text-xs">
                      <div className="text-orange-700 font-medium">⚠️ Large Dataset Detected</div>
                      <div className="text-orange-600 mt-1">
                        • Processing with TURBO WORKERS (parallel batches)<br/>
                        • Ultra-fast time: ~{Math.floor(debugInfo.recommendedCount * 0.6)}s<br/>
                        • Final PDF will have {debugInfo.recommendedCount} pages<br/>
                        <br/>
                        <strong>⚡ Turbo Workers:</strong> Maximum Performance:<br/>
                        • 2 labels processed simultaneously<br/>
                        • Optimized delays (300-750ms)<br/>  
                        • Parallel batches with load balancing
                      </div>
                    </div>
                  )}
                  
                  {debugInfo.recommendedCount <= 25 && debugInfo.recommendedCount > 1 && (
                    <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                      <div className="text-blue-700 font-medium">ℹ️ Multiple Labels</div>
                      <div className="text-blue-600 mt-1">
                        • Processing with TURBO WORKERS (parallel batches)<br/>
                        • Ultra-fast time: ~{Math.floor(debugInfo.recommendedCount * 0.6)}s<br/>
                        • Final PDF will have {debugInfo.recommendedCount} pages<br/>
                        <br/>
                        <strong>⚡ Turbo Workers:</strong> Maximum Performance
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-4">
              <form onSubmit={handleSubmit(onRenderSubmit)} className="flex flex-col gap-6 flex-1">
                <Tabs defaultValue="zpl" className="flex-1 flex flex-col">
                  <TabsList className={`grid w-full ${username === 'admin' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <TabsTrigger value="zpl">ZPL Code</TabsTrigger>
                    {username === 'admin' && <TabsTrigger value="logs">Logs</TabsTrigger>}
                  </TabsList>
                  <TabsContent value="zpl" className="flex-1 flex flex-col relative">
                     <Controller
                      name="zpl"
                      control={control}
                      render={({ field }) => (
                        <Textarea
                          {...field}
                          placeholder="Enter ZPL code here..."
                          className="flex-1 font-mono text-xs resize-none"
                          aria-label="ZPL Code Input"
                        />
                      )}
                    />
                    <div className="absolute bottom-2 right-2 flex gap-1">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button type="button" size="icon" variant="ghost" onClick={() => fileInputRef.current?.click()}><FileText className="h-4 w-4"/></Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Upload .zpl file</p></TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button type="button" size="icon" variant="ghost" onClick={() => setValue("zpl", EXAMPLE_ZPL)}><Bot className="h-4 w-4"/></Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Load Example</p></TooltipContent>
                        </Tooltip>
                         <Tooltip>
                            <TooltipTrigger asChild>
                               <Button type="button" size="icon" variant="ghost" onClick={() => setValue("zpl", "")}><Eraser className="h-4 w-4"/></Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Clear</p></TooltipContent>
                        </Tooltip>
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".zpl,.txt"
                        className="hidden"
                      />
                  </TabsContent>
                  {username === 'admin' && (
                    <TabsContent value="logs" className="flex-1">
                       <Card className="h-full">
                          <CardContent className="p-0 h-full">
                              <ScrollArea className="h-full w-full rounded-md border p-4 font-mono text-xs">
                                  {renderResult?.logs && renderResult.logs.length > 0 ? (
                                      renderResult.logs.map((log, index) => <p key={index} className={log.toLowerCase().includes("error") ? 'text-destructive' : log.toLowerCase().includes('warn') ? 'text-amber-600' : ''}>{log}</p>)
                                  ) : (
                                      <p className="text-muted-foreground">No logs yet. Click Render to see output.</p>
                                  )}
                              </ScrollArea>
                          </CardContent>
                      </Card>
                    </TabsContent>
                  )}
                </Tabs>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="dpi">DPI</Label>
                    <Controller
                        name="dpi"
                        control={control}
                        render={({ field }) => (
                            <Select onValueChange={(v) => field.onChange(parseInt(v))} value={String(field.value)}>
                                <SelectTrigger id="dpi"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    {DPI_OPTIONS.map(d => <SelectItem key={d} value={String(d)}>{d} dpi</SelectItem>)}
                                </SelectContent>
                            </Select>
                        )}
                    />
                  </div>
                  <div>
                    <Label htmlFor="orientation">Orientation</Label>
                    <Controller
                        name="orientation"
                        control={control}
                        render={({ field }) => (
                            <Select onValueChange={field.onChange} value={field.value}>
                                <SelectTrigger id="orientation"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="0">Normal (0°)</SelectItem>
                                    <SelectItem value="90">Rotated (90°)</SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                    <div className="md:col-span-1">
                        <Label htmlFor="width">Width</Label>
                        <Controller name="width" control={control} render={({ field }) => <Input id="width" type="number" step="0.1" {...field} onChange={e => field.onChange(parseFloat(e.target.value))}/>} />
                    </div>
                    <div className="md:col-span-1">
                        <Label htmlFor="height">Height</Label>
                        <Controller name="height" control={control} render={({ field }) => <Input id="height" type="number" step="0.1" {...field} onChange={e => field.onChange(parseFloat(e.target.value))}/>} />
                    </div>
                     <div className="md:col-span-1">
                        <Controller
                            name="unit"
                            control={control}
                            render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        {UNIT_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            )}
                        />
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 mt-auto pt-4">
                  <Button type="submit" className="w-full" disabled={isLoading || !zplValue}>
                    {isLoading ? <Loader2 className="animate-spin mr-2" /> : <Redo className="mr-2 h-4 w-4"/>}
                    Render
                  </Button>
                  <Button type="button" variant="secondary" className="w-full" onClick={() => handleDownload('png')} disabled={!renderResult}>
                    <Download className="mr-2 h-4 w-4" /> PNG
                  </Button>
                  <Button type="button" variant="secondary" className="w-full" onClick={() => handleDownload('pdf')} disabled={!zplValue || isDownloadingPdf}>
                    {isDownloadingPdf ? <Loader2 className="animate-spin mr-2" /> : <Download className="mr-2 h-4 w-4" />}
                    {isProcessingLarge ? `PDF (${debugInfo?.recommendedCount} labels)` : 'PDF'}
                  </Button>
                  <Button type="button" variant="outline" className="w-full" onClick={handleDebugLabels} disabled={!zplValue}>
                    <Bot className="mr-2 h-4 w-4" />
                    Debug Labels
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Preview Panel */}
          <Card className="lg:col-span-2 flex flex-col">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Preview</CardTitle>
                  <CardDescription>
                    {renderResult ? `Preview (First Label): ${renderResult.widthPx} x ${renderResult.heightPx} px | ${physicalWidth} x ${physicalHeight} ${currentUnit} @ ${currentDpi}dpi` : "Your rendered label will appear here."}
                  </CardDescription>
                </div>
                 <div className="flex items-center gap-4">
                    {renderResult && totalLabels > 1 && (
                      <div className="text-sm font-medium text-muted-foreground">
                        Preview: First label of {totalLabels} total labels
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Grid className="h-4 w-4 text-muted-foreground"/>
                      <Switch checked={showGrid} onCheckedChange={setShowGrid} aria-label="Toggle Grid"/>
                    </div>
                    <div className="flex items-center gap-2 w-40">
                      <ZoomOut className="h-4 w-4 text-muted-foreground" />
                      <Slider value={[zoom]} onValueChange={(v) => setZoom(v[0])} min={0.1} max={3} step={0.1} />
                      <ZoomIn className="h-4 w-4 text-muted-foreground" />
                    </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 bg-muted/50 rounded-b-lg overflow-auto flex items-center justify-center p-0 min-h-[500px]">
                {renderResult?.imageDataUrl ? (
                    <canvas 
                        ref={canvasRef}
                        style={{ 
                            width: `${renderResult.widthPx * zoom}px`, 
                            height: `${renderResult.heightPx * zoom}px`, 
                            imageRendering: 'pixelated',
                            maxWidth: '90%',
                            maxHeight: '90%',
                            objectFit: 'contain',
                            margin: '0',
                            display: 'block'
                        }}
                        className="transition-transform duration-200 ease-in-out shadow-lg"
                    />
                ) : isLoading ? (
                    <div className="text-center text-muted-foreground flex flex-col items-center gap-4">
                        <Loader2 className="animate-spin h-8 w-8"/>
                        <p>Rendering label...</p>
                    </div>
                ) : (
                    <div className="text-center text-muted-foreground">
                        <p>Click "Render" to preview your label.</p>
                    </div>
                )}
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  );
}
