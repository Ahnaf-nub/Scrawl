"""Builds a single-file UI preview (no backend) at scrawl-preview.html."""
import base64, io, re, sys
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parent.parent
im = Image.open(root / "samples/sample-sketch.jpg"); im.thumbnail((800, 450)); b = io.BytesIO(); im.save(b, "JPEG", quality=80)
uri = "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
shim = """(function(){history.replaceState=function(){};const SRC="%s";const rf=window.fetch;
window.fetch=function(u,o){if(String(u).indexOf("/api/generate")===0){const L=JSON.parse(JSON.stringify(Scrawl.SAMPLE_LEVEL));L.title="Your drawn level";
return new Promise(r=>setTimeout(()=>r(new Response(JSON.stringify({id:"preview0001",level:L}),{status:200})),1800));}
if(String(u).indexOf("/api/config")===0)return Promise.resolve(new Response("{}"));return rf.apply(this,arguments);};
document.getElementById("pick").addEventListener("click",function(e){e.stopImmediatePropagation();
fetch(SRC).then(r=>r.blob()).then(b=>{const dt=new DataTransfer();dt.items.add(new File([b],"s.jpg",{type:"image/jpeg"}));
const i=document.getElementById("file");i.files=dt.files;i.dispatchEvent(new Event("change"));});},true);})();""" % uri
html = (root / "static/index.html").read_text()
html = html.replace('<link rel="stylesheet" href="/static/style.css">', "<style>" + (root / "static/style.css").read_text() + "</style>")
html = html.replace("<body>", '<body><div style="background:#ffc83d;color:#15122b;font:600 14px system-ui;padding:8px 16px;text-align:center">UI preview. &ldquo;Choose a photo&rdquo; loads the sample sketch with a canned result instead of calling Gemma.</div>')
html = re.sub(r'<script src="https://cdn.jsdelivr.net[^>]*></script>\s*', "", html)
html = re.sub(r'<script src="/static/game.js"></script>\s*<script src="/static/modes.js"></script>\s*<script src="/static/app.js"></script>\s*<script src="/static/extras.js"></script>',
  lambda m: "<script>" + (root / "static/game.js").read_text() + "</script><script>" + (root / "static/modes.js").read_text() + "</script><script>" + shim + "</script><script>" + (root / "static/app.js").read_text() + "</script>", html)
out = Path(sys.argv[1] if len(sys.argv) > 1 else root / "scrawl-preview.html"); out.write_text(html); print(out, len(html) // 1024, "KB")
