import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const root = path.resolve(import.meta.dirname, '../..');
const fixtures = JSON.parse(await readFile(new URL('./fixtures.json', import.meta.url)));
const out = path.resolve(process.argv[2] ?? 'verification/organic-paint/output');
await mkdir(out, {recursive: true});
const rendererSha256 = createHash('sha256').update(await readFile(path.join(root,'src/TimelineCompositionV2.tsx'))).digest('hex');
const serveUrl = await bundle({entryPoint: path.join(root, 'verification/organic-paint/entry.tsx'),
  webpackOverride: config => config});
const records = [];
for (let index = 0; index < fixtures.clips.length; index++) {
  const clip = fixtures.clips[index], style = clip.attributes.text_style;
  for (const localFrame of [30, 60]) {
    for (const solid of [true, false]) {
      const output = path.join(out, `${index}-${localFrame}-${solid ? 'solid' : 'gradient'}.png`);
      const inputProps = {index, solid};
      const composition = await selectComposition({serveUrl, id: 'PaintProbe', inputProps});
      await renderStill({serveUrl, composition, inputProps, output, imageFormat: 'png',
        frame: Math.round(clip.startMs * .03) + localFrame, logLevel: 'error'});
      records.push({index, localFrame, solid, output, style});
    }
  }
}
await writeFile(path.join(out, 'samples.json'), JSON.stringify(records, null, 2));
const pixels = spawnSync('python3', ['-c', `
import sys,json
from PIL import Image
rows=json.load(open(sys.argv[1])); out=[]
for r in rows:
 s=r['style']; im=Image.open(r['output']).convert('RGB'); counts=[]; semantic=[]
 for n in range(len(s['lines'])):
  y=s['y']+n*s['fontSize']*s['lineHeight']
  box=im.crop((int(s['x']-20),int(y),int(s['x']+s['width']+20),int(y+s['fontSize']*s['lineHeight'])))
  counts.append(sum(1 for p in box.getdata() if min(p)>100 and max(p)>170))
 for span in s['emphasisSpans']:
  y=s['y']+span['line']*s['fontSize']*s['lineHeight']; color=s['palette'][span['color'] if span['startMs']<=r['localFrame']/30*1000<span['endMs'] else 'base']
  target=tuple(int(color[k:k+2],16) for k in (1,3,5)); box=im.crop((int(s['x']-20),int(y),int(s['x']+s['width']+20),int(y+s['fontSize']*s['lineHeight'])))
  semantic.append(sum(1 for p in box.getdata() if all(abs(p[k]-target[k])<18 for k in range(3))))
 out.append({'index':r['index'],'localFrame':r['localFrame'],'solid':r['solid'],'brightGlyphPixels':counts,'semanticPalettePixels':semantic})
print(json.dumps(out))
`, path.join(out, 'samples.json')], {encoding: 'utf8'});
if (pixels.status) throw new Error(pixels.stderr);
const results = JSON.parse(pixels.stdout);
await writeFile(path.join(out, 'pixels.json'), JSON.stringify(results, null, 2));
for (const result of results.filter(r => !r.solid)) {
  const control = results.find(r => r.index === result.index && r.localFrame === result.localFrame && r.solid);
  result.brightGlyphPixels.forEach((count, line) => assert.ok(count >= control.brightGlyphPixels[line] * .55,
    `Title ${result.index}, frame ${result.localFrame}, line ${line} gradient has ${count} bright glyph pixels vs ${control.brightGlyphPixels[line]} solid`));
  result.semanticPalettePixels.forEach(count=>assert.ok(count>200,'Semantic palette must paint actual opaque glyph pixels.'));
}
await writeFile(path.join(out,'report.json'),JSON.stringify({passed:true,rendererSha256,sourceSha256:fixtures.sourceSha256,results},null,2));
console.log(JSON.stringify({passed: true,rendererSha256, sourceSha256: fixtures.sourceSha256, output: out, results}));
