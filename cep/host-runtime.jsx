// Private runtime. Polls are initiated by the CEP page, never app.scheduleTask.
function logToPanel(message) {
    var level = /error|failed|critical/i.test(message) ? "error" : "info";
    cepState.logs.push({ id: ++cepState.sequence, time: new Date().toLocaleTimeString(), level: level, message: String(message) });
    if (cepState.logs.length > 150) cepState.logs.shift();
}
function readCommand() {
    var file = new File(getCommandFilePath());
    if (!file.exists) return null;
    file.encoding = "UTF-8";
    if (!file.open("r")) throw new Error("Cannot read command file: " + file.error);
    var contents;
    try { contents = file.read(); } finally { file.close(); }
    return contents ? JSON.parse(contents.replace(/^\uFEFF/, "")) : null;
}
var folderPath = "";
var initializationError = "";
try {
    folderPath = getBridgeFolder().fsName;
    var previousCommand = readCommand();
    if (previousCommand) lastProcessedCommandId = previousCommand.commandId || previousCommand.timestamp || "";
} catch (initialError) {
    initializationError = initialError.toString();
    cepState.active = false;
    cepState.status = initializationError;
    logToPanel(initializationError);
}
// Retire earlier ScriptUI instances in the same ExtendScript engine.
try { if ($.global.mcpCheckTaskId != null) app.cancelTask($.global.mcpCheckTaskId); } catch (ignored) {}
try { if ($.global.__aeMcpBridgeV2 && $.global.__aeMcpBridgeV2.dispose) $.global.__aeMcpBridgeV2.dispose(); } catch (ignored2) {}
try { if ($.global.__mcpBridgeAuto && $.global.__mcpBridgeAuto.taskId != null) app.cancelTask($.global.__mcpBridgeAuto.taskId); } catch (ignored3) {}
$.global.checkForCommands = function () {};
var api = {};
var instanceId = "ae-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1000000000);
var completedRequests = {}, completedOrder = [];
function endpoints() {
    var result = [];
    try {
        var files = getBridgeFolder().getFiles("endpoint-*.json");
        for (var i = 0; i < files.length; i++) {
            var file = files[i]; file.encoding = "UTF-8";
            if (!file.open("r")) continue;
            var text; try { text = file.read(); } finally { file.close(); }
            try { var endpoint = JSON.parse(text); if (endpoint.protocol === 1) result.push(endpoint); } catch (e) {}
        }
    } catch (e) {}
    return result;
}
function snapshot(afterId) {
    var entries = [];
    for (var i = 0; i < cepState.logs.length; i++) if (cepState.logs[i].id > (afterId || 0)) entries.push(cepState.logs[i]);
    return JSON.stringify({
        active: cepState.active, busy: cepState.busy, status: cepState.status,
        processed: cepState.processed, errors: cepState.errors, lastCommand: cepState.lastCommand,
        lastAt: cepState.lastAt, sequence: cepState.sequence, logs: entries,
        aeVersion: app.version, bridgeVersion: BRIDGE_VERSION, bridgeFolder: folderPath,
        project: app.project && app.project.file ? app.project.file.name : "Untitled Project",
        initializationError: initializationError
        , instanceId: instanceId, endpoints: endpoints()
    });
}
api.poll = function (afterId) {
    if ($.global.__aeMcpCep !== api) return JSON.stringify({ superseded: true });
    if (!cepState.active || cepState.busy) return snapshot(afterId);
    cepState.busy = true;
    try {
        var request = readCommand();
        var key = request ? request.commandId || request.timestamp || "" : "";
        if (key && key !== lastProcessedCommandId) {
            lastProcessedCommandId = key;
            currentCommandId = request.commandId || "";
            cepState.lastCommand = request.command;
            cepState.lastAt = new Date().toLocaleTimeString();
            cepState.commandFailed = false;
            executeCommand(request.command, request.args || {});
            cepState.processed++;
            if (cepState.commandFailed) cepState.errors++;
        }
    } catch (error) {
        var message = error.toString();
        if (cepState.status !== message) { cepState.errors++; logToPanel(message); }
        cepState.status = message;
    } finally { cepState.busy = false; }
    return snapshot(afterId);
};
api.state = snapshot;
api.dispatch = function (request, afterId) {
    var started = new Date().getTime();
    var result;
    function rejected(message) { return JSON.stringify({ status: "error", error: message, _commandId: request.commandId, dispatched: false }); }
    if ($.global.__aeMcpCep !== api || request.instanceId !== instanceId) result = rejected("AE instance changed; command not executed.");
    else if (completedRequests[request.commandId]) result = completedRequests[request.commandId];
    else if (!cepState.active || cepState.busy) result = rejected("AE panel paused or busy; command not executed.");
    else if (request.expiresAt < started) result = rejected("Command expired before execution; command not executed.");
    else {
        cepState.busy = true;
        try {
            currentCommandId = request.commandId;
            cepState.lastCommand = request.command;
            cepState.lastAt = new Date().toLocaleTimeString();
            cepState.commandFailed = false;
            result = executeCommand(request.command, request.args || {}, true);
            if (!result) result = JSON.stringify({ status: "error", error: "Host returned no result; inspect scene before retrying.", _commandId: request.commandId });
            cepState.processed++;
            if (cepState.commandFailed) cepState.errors++;
            // Bounded replay protection, useful for duplicate packets within this host session.
            completedRequests[request.commandId] = result;
            completedOrder.push(request.commandId);
            if (completedOrder.length > 16) delete completedRequests[completedOrder.shift()];
        } finally { cepState.busy = false; }
    }
    return JSON.stringify({ result: result, state: JSON.parse(snapshot(afterId)) });
};
api.setActive = function (active, afterId) {
    cepState.active = !!active && !initializationError;
    cepState.status = cepState.active ? "Ready" : "Paused";
    logToPanel(cepState.active ? "Bridge resumed" : "Bridge paused");
    return snapshot(afterId);
};
api.probe = function (afterId) {
    try {
        var info = JSON.parse(getProjectInfo());
        logToPanel("AE connected: " + app.version + "; " + info.projectName + "; items: " + info.numItems);
    } catch (error) { logToPanel("AE check failed: " + error.toString()); }
    return snapshot(afterId);
};
$.global.__aeMcpCep = api;
logToPanel("CEP bridge ready · " + BRIDGE_VERSION);
logToPanel("Bridge folder: " + folderPath);
