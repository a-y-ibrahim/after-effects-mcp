import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/scripts/mcp-bridge-auto.jsx', import.meta.url), 'utf8');
const helper = source.split('// BEGIN MCP synchronous preview renderer\n')[1].split('// END MCP synchronous preview renderer')[0];

function fixture(mode = 'success') {
  const files = new Set<string>();
  const folders = new Set<string>();
  const copied: string[] = [];
  const rendered: string[][] = [];
  class File {
    fsName: string;
    constructor(path: string) { this.fsName = path; }
    get exists() { return files.has(this.fsName); }
    copy(to: string) { if (mode === 'copy-failure') return false; files.add(to); copied.push(to); return true; }
    remove() { return files.delete(this.fsName); }
  }
  class Folder {
    fsName: string;
    constructor(path: string) { this.fsName = path; if (mode === 'collision') { folders.add(path); files.add(path + '/user.png'); } }
    get exists() { return folders.has(this.fsName); }
    create() { folders.add(this.fsName); return true; }
    getFiles(pattern?: string) {
      return [...files].filter(p => p.startsWith(this.fsName + '/') && (!pattern || p.includes('/frame_'))).map(p => new File(p));
    }
    remove() { return folders.delete(this.fsName); }
  }
  const status = { QUEUED: 1, DONE: 2, UNQUEUED: 3, STOPPED: 4 };
  const items: any[] = [];
  function makeItem(name: string, initialStatus: number) {
    let enabled = initialStatus !== status.UNQUEUED;
    const module = {
      file: null as File | null,
      applyTemplate(name: string) { expect(name).toBe('_HIDDEN X-Factor 8'); },
      getSettings() { return { Format: mode === 'bad-template' ? 'H.264' : 'PNG Sequence', Depth: 'Millions of Colors+', Channels: 'RGB + Alpha', Color: 'Straight (Unmatted)' }; },
      setSettings() {},
    };
    const item: any = {
      name, status: initialStatus, settings: {}, module,
      outputModule() { return module; },
      setSettings(settings: object) { Object.assign(item.settings, settings); },
      remove() { items.splice(items.indexOf(item), 1); },
    };
    Object.defineProperty(item, 'render', {
      get() { return enabled; },
      set(value) {
        if (item.status === status.DONE) throw Error('Cannot change DONE item');
        enabled = value; item.status = value ? status.QUEUED : status.UNQUEUED;
      },
    });
    items.push(item); return item;
  }
  const pending = makeItem('user-pending', status.QUEUED);
  const done = makeItem('user-done', status.DONE);
  const unqueued = makeItem('user-disabled', status.UNQUEUED);
  let job: any;
  const queue = {
    rendering: mode === 'busy',
    get numItems() { return items.length; },
    item(i: number) { return items[i - 1]; },
    items: { add() { job = makeItem('preview', status.QUEUED); return job; } },
    render() {
      rendered.push(items.filter(i => i.status === status.QUEUED).map(i => i.name));
      if (mode === 'throw') throw Error('render failed');
      job.status = mode === 'stopped' ? status.STOPPED : status.DONE;
      if (mode !== 'missing-file') files.add(job.module.file.fsName.replace('[#####]', '00000'));
    },
  };
  const project = { bitsPerChannel: 32, renderQueue: queue };
  const context = vm.createContext({ app: { project }, File, Folder, RQItemStatus: status, GetSettingsFormat: { STRING: 1 } });
  vm.runInContext(helper, context);
  return { invoke: (time = 0, quality = 'accurate') => context._renderPreviewPng({ duration: 10, frameDuration: 1 / 30 }, time, '/scratch/capture.png', false, quality),
    pending, done, unqueued, items, files, folders, rendered, project, copied, job: () => job };
}

describe('preview render preserves project and queue state', () => {
  it('draft lowers render resolution while preserving project precision and 8-bit output', () => {
    const f=fixture(); f.invoke(0,'draft'); expect(f.job().settings.Resolution).toBe('Quarter'); expect(f.project.bitsPerChannel).toBe(32);
  });
  it('renders only its own item at project precision into explicit 8-bit PNG', () => {
    const f = fixture();
    expect(f.invoke(10)).toBeCloseTo(299 / 30);
    expect(f.rendered).toEqual([['preview']]);
    expect(f.project.bitsPerChannel).toBe(32);
    expect(f.job().settings['Color Depth']).toBe('Current Settings');
    expect(f.job().settings['Motion Blur']).toBe('Off for All Layers');
    expect(f.job().timeSpanDuration).toBe(1 / 30);
    expect(f.copied).toEqual(['/scratch/capture.png']);
    expect(f.pending.render).toBe(true);
    expect(f.done.render).toBe(true);
    expect(f.unqueued.render).toBe(false);
    expect(f.items).toHaveLength(3);
    expect(f.folders.size).toBe(0);
  });
  for (const mode of ['throw', 'stopped', 'missing-file', 'copy-failure', 'bad-template']) {
    it(`restores pending jobs and removes its temporary item after ${mode}`, () => {
      const f = fixture(mode);
      expect(() => f.invoke()).toThrow();
      expect(f.pending.render).toBe(true);
      expect(f.done.render).toBe(true);
      expect(f.unqueued.render).toBe(false);
      expect(f.items).toHaveLength(3);
      expect(f.folders.size).toBe(0);
      expect(f.project.bitsPerChannel).toBe(32);
    });
  }
  it('refuses to enter an active render queue', () => {
    const f = fixture('busy');
    expect(() => f.invoke()).toThrow(/render queue is rendering/);
    expect(f.items).toHaveLength(3);
    expect(f.rendered).toEqual([]);
  });
  it('does not delete files in a preexisting directory', () => {
    const f = fixture('collision');
    expect(() => f.invoke()).toThrow(/Cannot create/);
    expect([...f.files].some(p => p.endsWith('/user.png'))).toBe(true);
    expect(f.pending.render).toBe(true);
  });
  it('all preview paths use the synchronous export helper', () => {
    expect(/^\s*[A-Za-z_]\w*\.saveFrameToPng\s*\(/m.test(source)).toBe(false);
    expect(source).not.toContain('target.motionBlur = motionBlur');
  });
});
