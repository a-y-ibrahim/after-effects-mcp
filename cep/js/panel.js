(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  var cs, timer, busy = false, stopped = false, generation = 0, lastId = 0, state, entries = [], failures = 0;
  var meta = window.MCP_BUILD || {};
  var live = window.MCP_LIVE, requests = [];
  live.attach(function (packet, reply) { requests.push({packet: packet, reply: reply}); drain(); });
  function drain() {
    if (busy || stopped || !requests.length) return;
    var task = requests.shift(), epoch = generation;
    busy = true; clearTimeout(timer);
    var started = Date.now();
    cs.evalScript(hostCall('$.global.__aeMcpCep.dispatch(' + JSON.stringify(task.packet) + ',' + lastId + ')'), function (raw) {
      if (epoch !== generation) return;
      busy = false;
      try {
        var data = JSON.parse(raw);
        if (typeof data.result !== 'string') throw new Error('Missing host result');
        task.reply(data.result); render(data.state);
        el('latency').textContent = (Date.now() - started) + ' ms · live';
      } catch (error) {
        // Do not invent a failure before dispatch: execution may already have happened.
        failure('Результат команды неизвестен: ' + String(error));
        live.close();
      }
      if (requests.length) drain(); else schedule();
    });
  }
  el('version').textContent = 'Enhanced ' + meta.upstreamVersion + ' · CEP ' + meta.version;
  el('tools').textContent = meta.toolCount || '—';
  function failure(message) {
    el('status').textContent = 'Нет связи'; el('status-dot').className = 'dot error';
    el('detail').textContent = message; el('toggle').disabled = true; el('probe').disabled = true;
  }
  function drawLogs() {
    var container = el('log'), stick = container.scrollTop + container.clientHeight >= container.scrollHeight - 24;
    container.textContent = '';
    entries.filter(function (entry) { return el('verbose').checked || entry.level === 'error' || /Executing command:|Command completed successfully:|CEP bridge|AE connected:|Bridge resumed|Bridge paused/.test(entry.message); }).forEach(function (entry) {
      var row = document.createElement('div'), time = document.createElement('time');
      row.className = 'entry ' + entry.level; time.textContent = entry.time;
      row.appendChild(time); row.appendChild(document.createTextNode(entry.message)); container.appendChild(row);
    });
    if (stick) container.scrollTop = container.scrollHeight;
  }
  function render(next) {
    if (next.superseded) throw new Error('Мост перезагружен. Нажмите «Переподключить».');
    state = next; lastId = next.sequence || 0;
    live.update(next);
    el('toggle').disabled = !!next.initializationError; el('probe').disabled = false;
    el('toggle').textContent = next.active ? 'Пауза' : 'Запустить';
    el('status').textContent = next.initializationError ? 'Ошибка запуска' : next.active ? 'Мост активен' : 'Мост на паузе';
    el('status-dot').className = 'dot ' + (next.initializationError ? 'error' : next.active ? 'ready' : 'paused');
    el('detail').textContent = next.initializationError || (next.active ? 'Ожидает команды MCP · ' : 'Приём команд остановлен · ') + next.project;
    el('host').textContent = 'After Effects ' + next.aeVersion;
    el('processed').textContent = next.processed; el('errors').textContent = next.errors;
    el('last-command').textContent = next.lastCommand || '—'; el('last-command').title = next.lastAt || '';
    el('bridge-path').value = next.bridgeFolder;
    if (next.logs && next.logs.length) { entries = entries.concat(next.logs).slice(-250); drawLogs(); }
  }
  function schedule(delay) {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(function () { call('poll', [lastId]); }, delay || (live.connected() ? 1000 : state && state.active ? 250 : 1000));
  }
  function hostCall(expression) {
    // Always return a value explicitly. Other extensions share the AE engine.
    return '(function () { try { return ' + expression + '; } catch (e) { return "__MCP_ERROR__" + String(e); } })()';
  }
  function parseReply(result) {
    if (typeof result !== 'string' || !result.replace(/\s/g, '')) throw new Error('AE вернул пустой ответ');
    if (result.indexOf('__MCP_ERROR__') === 0) throw new Error(result.slice(13));
    var next = JSON.parse(result);
    if (!next || typeof next.active !== 'boolean') throw new Error('Некорректный ответ моста');
    return next;
  }
  function retry(error) {
    failures++;
    failure('Ожидаем AE, повторяем соединение… ' + String(error.message || error));
    // A transient empty evalScript reply must not permanently stop polling.
    schedule(Math.min(5000, failures * 500));
  }
  function call(method, args) {
    if (busy || stopped) return;
    busy = true; clearTimeout(timer);
    var started = Date.now(), epoch = generation;
    var code = '$.global.__aeMcpCep.' + method + '(' + args.map(function (value) { return JSON.stringify(value); }).join(',') + ')';
    cs.evalScript(hostCall(code), function (result) {
      if (epoch !== generation) return;
      busy = false;
      try { render(parseReply(result)); failures = 0; el('latency').textContent = (Date.now() - started) + ' ms'; if (requests.length) drain(); else schedule(); }
      catch (error) { retry(error); }
    });
  }
  function initialize() {
    if (busy) return;
    live.close(); requests = [];
    stopped = false; generation++; clearTimeout(timer); busy = true; lastId = 0; entries = []; failures = 0;
    var epoch = generation;
    el('status').textContent = 'Подключение…'; el('detail').textContent = 'Загружаем обработчики After Effects';
    el('toggle').disabled = true; el('probe').disabled = true;
    var extensionPath = cs.getSystemPath(SystemPath.EXTENSION).replace(/\\/g, '/');
    var serverPath = extensionPath + '/build/index.js';
    el('server-path').value = serverPath;
    el('config').value = JSON.stringify({mcpServers:{'after-effects-enhanced':{command:'node',args:[serverPath]}}}, null, 2);
    cs.evalScript(hostCall('(function () { $.evalFile(new File(' + JSON.stringify(extensionPath + '/cep/jsx/bridge.jsx') + ')); return $.global.__aeMcpCep.state(0); })()'), function (result) {
      if (epoch !== generation) return;
      busy = false;
      try { render(parseReply(result)); schedule(); }
      catch (error) { failure('Ошибка загрузки моста: ' + result); }
    });
  }
  el('toggle').addEventListener('click', function () { if (state) call('setActive', [!state.active, lastId]); });
  el('probe').addEventListener('click', function () { call('probe', [lastId]); });
  el('reload').addEventListener('click', function () { if (cs) initialize(); });
  el('clear').addEventListener('click', function () { entries = []; drawLogs(); });
  el('verbose').addEventListener('change', drawLogs);
  el('copy-config').addEventListener('click', function () {
    el('config').focus(); el('config').select();
    el('copy-config').textContent = document.execCommand('copy') ? 'Скопировано' : 'Выделено — нажмите Ctrl+C';
    setTimeout(function () { el('copy-config').textContent = 'Копировать конфигурацию'; }, 2000);
  });
  window.addEventListener('beforeunload', function () { stopped = true; generation++; clearTimeout(timer); live.close(); });
  if (!window.__adobe_cep__) { failure('Откройте панель в After Effects: Window → Extensions → MCP Bridge AE.'); return; }
  try { cs = new CSInterface(); initialize(); } catch (error) { failure(String(error)); }
})();
