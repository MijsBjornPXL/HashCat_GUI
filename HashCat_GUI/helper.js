// helper.js — minimal local helper (use only on trusted host)
const express = require('express');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const app = express();
app.use(express.json({limit:'10mb'}));

const jobs = {};
let nextId = 1;

app.post('/run', (req, res) => {
  const { script } = req.body || {};
  if (!script) return res.status(400).json({ error: 'no script' });
  // safety checks
  if (!/hashcat/.test(script) || !/\/tmp\/hash.txt/.test(script)) return res.status(400).json({ error: 'script must call hashcat and write to /tmp/hash.txt' });
  const id = String(nextId++);
  const filename = `/tmp/crack_${id}.sh`;
  fs.writeFileSync(filename, script, { mode: 0o700 });
  jobs[id] = { state: 'queued', output: '', filename };
  const proc = spawn('sudo', ['sh', filename], { stdio: ['ignore','pipe','pipe'] });
  jobs[id].state = 'running';
  proc.stdout.on('data', d => { jobs[id].output += d.toString(); });
  proc.stderr.on('data', d => { jobs[id].output += d.toString(); });
  proc.on('close', code => { jobs[id].state = code === 0 ? 'done' : 'error'; jobs[id].code = code; });
  res.json({ id });
});

app.get('/status/:id', (req, res) => {
  const j = jobs[req.params.id]; if (!j) return res.status(404).json({ error: 'not found' });
  res.json({ state: j.state, output: j.output.slice(-20000) });
});

app.get('/show/:id', (req, res) => {
  const j = jobs[req.params.id]; if (!j) return res.status(404).json({ error: 'not found' });
  try {
    const s = spawnSync('hashcat', ['--show','-m', extractModeFromScript(j.filename), '/tmp/hash.txt'], { encoding: 'utf8', maxBuffer: 50*1024*1024 });
    res.json({ result: s.stdout || s.stderr || '' });
  } catch (e) { res.json({ result: String(e) }); }
});

function extractModeFromScript(fname){
  try {
    const c = fs.readFileSync(fname,'utf8');
    const m = c.match(/-m\s+(AUTO|\d+)/);
    if(!m) return '0';
    if(m[1] === 'AUTO') return '0';
    return m[1];
  } catch (e) { return '0'; }
}

app.listen(3000, ()=> console.log('helper running on http://localhost:3000'));
