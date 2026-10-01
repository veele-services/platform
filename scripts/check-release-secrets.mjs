/** Read-only artifact/history supplement. Reports only kind and location, never
 * bytes or matched values. Unknown credential formats still require review.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { secretIndicators } from "./check-source-secrets.mjs";

const limit=16*1024*1024;
export function inspectBlob(bytes) {
  if(bytes.length>limit) throw new Error("Oversized artifact requires separate review");
  return bytes.includes(0)?null:secretIndicators(bytes.toString("utf8"));
}

function main() {
  const flags=process.argv.slice(2);
  if(!flags.length||flags.some(flag=>!["--browser","--history"].includes(flag)))throw new Error("Choose browser or history scope");
  let text=0,binary=0,findings=0;
  const check=(bytes,location)=>{
    const found=inspectBlob(bytes);if(found===null){binary++;return;}
    text++;
    for(const finding of found){findings++;console.error(`Potential ${finding.kind} at ${location}:${finding.line}; value withheld.`);}
  };
  if(flags.includes("--browser")){
    const root=realpathSync(resolve(".next/static"));
    const visit=dir=>{
      for(const entry of readdirSync(dir,{withFileTypes:true})){
        const path=resolve(dir,entry.name),actual=realpathSync(path);
        if(!actual.startsWith(root+sep)||entry.isSymbolicLink())throw new Error("Unexpected artifact path");
        if(entry.isDirectory()){visit(path);continue;}
        const info=statSync(path);if(!info.isFile()||info.size>limit)throw new Error("Unscannable artifact");
        check(readFileSync(path),`.next/static/${path.slice(root.length+1)}`);
      }
    };
    visit(root);
  }
  if(flags.includes("--history")){
    // HEAD history only: no credentials/config from retired branches are used.
    const entries=execFileSync("git",["rev-list","--objects","HEAD"],{encoding:"utf8",maxBuffer:64*1024*1024}).trim().split("\n");
    const names=new Map(entries.map(line=>{const i=line.indexOf(" ");return [i<0?line:line.slice(0,i),i<0?"(object)":line.slice(i+1)];}));
    const objects=execFileSync("git",["cat-file","--batch-check=%(objectname) %(objecttype) %(objectsize)"],{input:[...names.keys()].join("\n")+"\n",encoding:"utf8",maxBuffer:64*1024*1024}).trim().split("\n").map(line=>line.split(" "));
    const blobs=objects.filter(row=>row[1]==="blob");
    if(blobs.some(row=>Number(row[2])>limit))throw new Error("Oversized historical blob requires separate review");
    // Bounded batches, including binary files; no content is written or logged.
    for(let i=0;i<blobs.length;i+=100){
      const batch=blobs.slice(i,i+100);
      const bytes=execFileSync("git",["cat-file","--batch"],{input:batch.map(row=>row[0]).join("\n")+"\n",maxBuffer:batch.reduce((sum,row)=>sum+Number(row[2])+256,1024)});
      let offset=0;
      for(const [id,,size] of batch){
        const end=bytes.indexOf(10,offset);if(end<offset)throw new Error("Malformed history batch");
        const header=bytes.subarray(offset,end).toString("ascii");
        if(header!==`${id} blob ${size}`)throw new Error("Unexpected history object");
        offset=end+1;check(bytes.subarray(offset,offset+Number(size)),`git:${id.slice(0,12)}:${names.get(id)}`);offset+=Number(size)+1;
      }
    }
    const shallow=execFileSync("git",["rev-parse","--is-shallow-repository"],{encoding:"utf8"}).trim();
    console.log(`Reachable HEAD history: ${blobs.length} blobs; shallow=${shallow}. Unreachable/other-branch objects excluded.`);
  }
  if(findings)throw new Error("Credential indicators require triage/rotation");
  console.log(`${text} text artifacts checked; ${binary} binary artifacts excluded. No recognized credential formats; unknown formats not covered.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{main();}catch{console.error("Release credential check failed; inspect reported locations only, never log values.");process.exitCode=1;}
}
