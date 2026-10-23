// Maintainer tool. Converts authored control anchors to fixed SVG path literals.
// This runs only when geography is edited, never when a learner opens the map.
import fs from 'node:fs';
const source=new URL('../references/map-territories/anchors.json',import.meta.url),target=new URL('../public/teyvat-territories.js',import.meta.url);
const anchors=JSON.parse(fs.readFileSync(source,'utf8')),f=n=>Number(n.toFixed(4));
function curve(ps){let out=`M ${ps[0].join(' ')}`;for(let i=0;i<ps.length;i++){const a=ps[(i-1+ps.length)%ps.length],b=ps[i],c=ps[(i+1)%ps.length],d=ps[(i+2)%ps.length];out+=` C ${f(b[0]+(c[0]-a[0])*.12)} ${f(b[1]+(c[1]-a[1])*.12)} ${f(c[0]-(d[0]-b[0])*.12)} ${f(c[1]-(d[1]-b[1])*.12)} ${c.join(' ')}`;}return out+' Z';}
const regions=Object.fromEntries(Object.entries(anchors).map(([id,r])=>[id,{outline:curve(r.outline),territories:r.patches.map((p,i)=>({portalId:id+'-'+String(i+1).padStart(2,'0'),path:curve(p)}))}]));
fs.writeFileSync(target,'// Fixed authored geography. All contours are literal cubic Bezier paths in atlas percentages.\n// See references/map-territories/anchors.json. Never generate areas from lesson positions.\nexport const TEYVAT_TERRITORIES = '+JSON.stringify(regions,null,2)+';\n');
