(function () {
  'use strict';
  var connections = {}, retryAt = {}, currentState = null, enqueue = null;
  function send(socket, value) { if (socket.readyState === 1) socket.send(JSON.stringify(value)); }
  window.MCP_LIVE = {
    attach: function (handler) { enqueue = handler; },
    connected: function () { return Object.keys(connections).some(function (id) { return connections[id].readyState === 1; }); },
    update: function (state) {
      currentState = state;
      (state.endpoints || []).forEach(function (endpoint) {
        if (connections[endpoint.sessionId] || (retryAt[endpoint.sessionId] || 0) > Date.now()) return;
        if (!/^[a-zA-Z0-9-]+$/.test(endpoint.token) || !(endpoint.port > 0 && endpoint.port < 65536)) return;
        var socket = new WebSocket('ws://127.0.0.1:' + endpoint.port + '/' + endpoint.token);
        connections[endpoint.sessionId] = socket;
        socket.onopen = function () { send(socket, { type: 'hello', instanceId: currentState.instanceId, active: currentState.active, version: currentState.bridgeVersion }); };
        socket.onmessage = function (event) {
          try {
            var packet = JSON.parse(event.data);
            if (packet.type !== 'command' || packet.instanceId !== currentState.instanceId || !enqueue) return;
            enqueue(packet, function (raw) { send(socket, { type: 'result', instanceId: packet.instanceId, commandId: packet.commandId, result: raw }); });
          } catch (error) { socket.close(); }
        };
        socket.onerror = function () { socket.close(); };
        socket.onclose = function () { delete connections[endpoint.sessionId]; retryAt[endpoint.sessionId] = Date.now() + 10000; };
      });
      Object.keys(connections).forEach(function (id) { send(connections[id], { type: 'state', active: state.active }); });
    },
    close: function () { Object.keys(connections).forEach(function (id) { connections[id].close(); }); connections = {}; }
  };
})();
