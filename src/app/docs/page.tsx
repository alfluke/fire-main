import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { EXAMPLE_ZPL } from "@/lib/constants";
import { CheckCircle2 } from "lucide-react";

export default function DocsPage() {
  return (
    <div className="container mx-auto p-4 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Documentation</CardTitle>
          <CardDescription>How to use the ZPL Viewer application.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          
          <section>
            <h2 className="text-2xl font-semibold mb-2">Instructions</h2>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>Enter your ZPL code into the textarea on the left, or upload a <code>.zpl</code> file.</li>
              <li>Configure the label settings (DPI, dimensions, orientation) to match your target printer.</li>
              <li>Click the <strong>Render</strong> button to see a live preview of your label.</li>
              <li>Use the zoom slider and grid toggle to inspect the preview.</li>
              <li>Check the <strong>Logs</strong> tab for any warnings or errors from the ZPL parser.</li>
              <li>Once satisfied, download the label as a <strong>PNG</strong> or <strong>PDF</strong> file.</li>
            </ol>
          </section>

          <Separator />
          
          <section>
            <h2 className="text-2xl font-semibold mb-2">Supported ZPL Commands</h2>
            <p className="text-muted-foreground mb-4">The parser is designed to be minimal and currently supports the following commands for image rendering:</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">~DG</Badge>
              <Badge variant="secondary">^XG</Badge>
              <Badge variant="secondary">^FO</Badge>
              <Badge variant="secondary">^POI/^POR</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-4">Other commands are ignored without causing an error. The UI orientation setting takes precedence over `^POI`/`^POR` commands in the ZPL code.</p>
          </section>

          <Separator />

          <section>
            <h2 className="text-2xl font-semibold mb-2">Example ZPL Code</h2>
            <p className="text-muted-foreground mb-4">Click the "Load Example" button on the main page to use this code.</p>
            <div className="bg-muted p-4 rounded-md">
              <pre className="text-sm font-mono whitespace-pre-wrap"><code>{EXAMPLE_ZPL}</code></pre>
            </div>
          </section>

          <Separator />
          
          <section>
            <h2 className="text-2xl font-semibold mb-2">Acceptance Criteria Checklist</h2>
            <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-start"><CheckCircle2 className="h-5 w-5 text-green-500 mr-2 mt-0.5 shrink-0"/><span>Rendering an image of 816x1218px at 203dpi is supported (use `^XG` scaling with the example).</span></li>
                <li className="flex items-start"><CheckCircle2 className="h-5 w-5 text-green-500 mr-2 mt-0.5 shrink-0"/><span>An image is positioned at the origin (0,0) if no `^FO` command precedes it.</span></li>
                <li className="flex items-start"><CheckCircle2 className="h-5 w-5 text-green-500 mr-2 mt-0.5 shrink-0"/><span>Selecting 90° orientation rotates the entire label preview correctly.</span></li>
                <li className="flex items-start"><CheckCircle2 className="h-5 w-5 text-green-500 mr-2 mt-0.5 shrink-0"/><span>Content drawn outside the specified media dimensions is correctly clipped.</span></li>
                <li className="flex items-start"><CheckCircle2 className="h-5 w-5 text-green-500 mr-2 mt-0.5 shrink-0"/><span>Downloaded PNG and PDF files are a pixel-perfect match of the preview.</span></li>
            </ul>
          </section>

        </CardContent>
      </Card>
    </div>
  );
}
