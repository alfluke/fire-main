'use server';

// Função dedicada para debugging da detecção de etiquetas
export async function debugZplLabels(zpl: string) {
    console.log('=== ZPL LABEL DEBUGGING ===');
    console.log(`ZPL total length: ${zpl.length} characters`);
    console.log(`ZPL starts with: ${zpl.substring(0, 150)}...`);
    console.log(`ZPL ends with: ...${zpl.substring(-100)}`);
    
    // Teste 1: Contagem de DGR
    const dgrMatches = zpl.match(/~DGR:/g);
    const dgrCount = dgrMatches?.length || 0;
    console.log(`Found ${dgrCount} ~DGR: commands`);
    
    // Teste 2: Contagem de XA/XZ pairs
    const xaMatches = zpl.match(/\^XA/g);
    const xzMatches = zpl.match(/\^XZ/g);
    console.log(`Found ${xaMatches?.length || 0} ^XA commands`);
    console.log(`Found ${xzMatches?.length || 0} ^XZ commands`);
    
    // Teste 3: Contagem de PQ
    const pqMatches = zpl.match(/\^PQ(\d+)/g);
    const pqCount = pqMatches?.length || 0;
    console.log(`Found ${pqCount} ^PQ commands:`, pqMatches);
    
    // TesteV4: Buscar padrões complexos
    const sections = zpl.split(/(~DGR:)/);
    const cleanSections = sections.filter(s => s.trim().length > 0);
    console.log(`ZPL split into ${cleanSections.length} sections`);
    
    // Análise final
    const finalCount = Math.max(dgrCount, pqCount, Math.floor((xaMatches?.length || 0) / 2));
    console.log(`RECOMMENDED LABEL COUNT: ${finalCount}`);
    console.log('=== END DEBUGGING ===');
    
    return {
        totalLength: zpl.length,
        dgrCount,
        pqCount,
        xaCount: xaMatches?.length || 0,
        xzCount: xzMatches?.length || 0,
        recommendedCount: finalCount
    };
}
