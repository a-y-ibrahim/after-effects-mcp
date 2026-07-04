








// ---------------------------------------------------------------------------
// ES5 polyfills for After Effects ExtendScript (ES3 engine). Without these,
// modern methods (e.g. Date.prototype.toISOString) throw "... is undefined" at
// RUNTIME inside AE - a Node test harness has them natively, which masked this
// until the first live test. All guarded, so they no-op where already present.
// ---------------------------------------------------------------------------
(function () {
    function pad2(n) { return (n < 10 ? "0" : "") + n; }
    function pad3(n) { var s = "" + n; while (s.length < 3) { s = "0" + s; } return s; }

    if (typeof Date.prototype.toISOString !== "function") {
        Date.prototype.toISOString = function () {
            return this.getUTCFullYear() + "-" + pad2(this.getUTCMonth() + 1) + "-" + pad2(this.getUTCDate()) +
                "T" + pad2(this.getUTCHours()) + ":" + pad2(this.getUTCMinutes()) + ":" + pad2(this.getUTCSeconds()) +
                "." + pad3(this.getUTCMilliseconds()) + "Z";
        };
    }
    if (typeof Date.prototype.toJSON !== "function") {
        Date.prototype.toJSON = function () { return this.toISOString(); };
    }
    if (typeof Date.now !== "function") {
        Date.now = function () { return new Date().getTime(); };
    }
    if (!Array.isArray) {
        Array.isArray = function (a) { return Object.prototype.toString.call(a) === "[object Array]"; };
    }
    if (!Array.prototype.indexOf) {
        Array.prototype.indexOf = function (item, from) {
            var len = this.length >>> 0; var i = from ? Number(from) : 0;
            if (i < 0) { i = Math.max(0, len + i); }
            for (; i < len; i++) { if (this[i] === item) { return i; } }
            return -1;
        };
    }
    if (!Array.prototype.forEach) {
        Array.prototype.forEach = function (cb, ctx) {
            var len = this.length >>> 0;
            for (var i = 0; i < len; i++) { if (i in this) { cb.call(ctx, this[i], i, this); } }
        };
    }
    if (!Array.prototype.map) {
        Array.prototype.map = function (cb, ctx) {
            var len = this.length >>> 0, out = new Array(len);
            for (var i = 0; i < len; i++) { if (i in this) { out[i] = cb.call(ctx, this[i], i, this); } }
            return out;
        };
    }
    if (!Array.prototype.filter) {
        Array.prototype.filter = function (cb, ctx) {
            var len = this.length >>> 0, out = [];
            for (var i = 0; i < len; i++) { if (i in this && cb.call(ctx, this[i], i, this)) { out.push(this[i]); } }
            return out;
        };
    }
    if (!String.prototype.trim) {
        String.prototype.trim = function () { return this.replace(/^[\s﻿\xA0]+|[\s﻿\xA0]+$/g, ""); };
    }
    if (!Object.keys) {
        Object.keys = function (obj) {
            var keys = [];
            for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) { keys.push(k); } }
            return keys;
        };
    }
})();

function createComposition(args) {
    try {
        var name = args.name || "New Composition";
        var width = parseInt(args.width) || 1920;
        var height = parseInt(args.height) || 1080;
        var pixelAspect = parseFloat(args.pixelAspect) || 1.0;
        var duration = parseFloat(args.duration) || 10.0;
        var frameRate = parseFloat(args.frameRate) || 30.0;
        var bgColor = args.backgroundColor ? [args.backgroundColor.r/255, args.backgroundColor.g/255, args.backgroundColor.b/255] : [0, 0, 0];
        var newComp = app.project.items.addComp(name, width, height, pixelAspect, duration, frameRate);
        if (args.backgroundColor) {
            newComp.bgColor = bgColor;
        }
        return JSON.stringify({
            status: "success", message: "Composition created successfully",
            composition: { name: newComp.name, id: newComp.id, width: newComp.width, height: newComp.height, pixelAspect: newComp.pixelAspect, duration: newComp.duration, frameRate: newComp.frameRate, bgColor: newComp.bgColor }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}


function createTextLayer(args) {
    try {
        var compName = args.compName || "";
        var text = args.text || "Text Layer";
        var position = args.position || [960, 540]; 
        var fontSize = args.fontSize || 72;
        var color = args.color || [1, 1, 1]; 
        var startTime = args.startTime || 0;
        var duration = args.duration || 5; 
        var fontFamily = args.fontFamily || "Arial";
        var alignment = args.alignment || "center"; 
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; } 
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }
        var textLayer = comp.layers.addText(text);
        var textProp = textLayer.property("ADBE Text Properties").property("ADBE Text Document");
        var textDocument = textProp.value;
        textDocument.fontSize = fontSize;
        textDocument.fillColor = color;
        textDocument.font = fontFamily;
        // Arabic / RTL: auto-detect from the text (or honor args.direction). When RTL
        // and the caller gave no alignment, default to right alignment.
        var isRtl = _applyTextDirection(textDocument, text, args.direction);
        if (isRtl && (args.alignment === undefined || args.alignment === null)) { alignment = "right"; }
        if (alignment === "left") { textDocument.justification = ParagraphJustification.LEFT_JUSTIFY; }
        else if (alignment === "center") { textDocument.justification = ParagraphJustification.CENTER_JUSTIFY; } 
        else if (alignment === "right") { textDocument.justification = ParagraphJustification.RIGHT_JUSTIFY; }
        textProp.setValue(textDocument);
        textLayer.property("ADBE Position").setValue(position);
        textLayer.startTime = startTime;
        if (duration > 0) { textLayer.outPoint = startTime + duration; }
        return JSON.stringify({
            status: "success", message: "Text layer created successfully",
            layer: { name: textLayer.name, index: textLayer.index, type: "text", rtl: isRtl, inPoint: textLayer.inPoint, outPoint: textLayer.outPoint, position: textLayer.property("ADBE Position").value }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}


function createShapeLayer(args) {
    try {
        var compName = args.compName || "";
        var shapeType = args.shapeType || "rectangle"; 
        var position = args.position || [960, 540]; 
        var size = args.size || [200, 200]; 
        var fillColor = args.fillColor || [1, 0, 0]; 
        var strokeColor = args.strokeColor || [0, 0, 0]; 
        var strokeWidth = args.strokeWidth || 0; 
        var startTime = args.startTime || 0;
        var duration = args.duration || 5; 
        var name = args.name || "Shape Layer";
        var points = args.points || 5; 
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; } 
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }
        var shapeLayer = comp.layers.addShape();
        shapeLayer.name = name;
        var contents = shapeLayer.property("ADBE Root Vectors Group"); 
        var shapeGroup = contents.addProperty("ADBE Vector Group");
        var groupContents = shapeGroup.property("ADBE Vectors Group"); 
        var shapePathProperty;
        if (shapeType === "rectangle") {
            shapePathProperty = groupContents.addProperty("ADBE Vector Shape - Rect");
            var rectSize = _safeProp(shapePathProperty, "ADBE Vector Rect Size", "Size"); if (rectSize) rectSize.setValue(size);
        } else if (shapeType === "ellipse") {
            shapePathProperty = groupContents.addProperty("ADBE Vector Shape - Ellipse");
            var ellipseSize = _safeProp(shapePathProperty, "ADBE Vector Ellipse Size", "Size"); if (ellipseSize) ellipseSize.setValue(size);
        } else if (shapeType === "polygon" || shapeType === "star") { 
            shapePathProperty = groupContents.addProperty("ADBE Vector Shape - Star");
            shapePathProperty.property("ADBE Vector Star Type").setValue(shapeType === "polygon" ? 1 : 2); 
            shapePathProperty.property("ADBE Vector Star Points").setValue(points);
            shapePathProperty.property("ADBE Vector Star Outer Radius").setValue(size[0] / 2);
            if (shapeType === "star") { shapePathProperty.property("ADBE Vector Star Inner Radius").setValue(size[0] / 3); }
        }
        var fill = groupContents.addProperty("ADBE Vector Graphic - Fill");
        var fillCol = _safeProp(fill, "ADBE Vector Fill Color", "Color"); if (fillCol) fillCol.setValue(fillColor);
        var fillOp = _safeProp(fill, "ADBE Vector Fill Opacity", "Opacity"); if (fillOp) fillOp.setValue(100);
        if (strokeWidth > 0) {
            var stroke = groupContents.addProperty("ADBE Vector Graphic - Stroke");
            var strokeCol = _safeProp(stroke, "ADBE Vector Stroke Color", "Color"); if (strokeCol) strokeCol.setValue(strokeColor);
            var strokeW = _safeProp(stroke, "ADBE Vector Stroke Width", "Stroke Width"); if (strokeW) strokeW.setValue(strokeWidth);
            var strokeOp = _safeProp(stroke, "ADBE Vector Stroke Opacity", "Opacity"); if (strokeOp) strokeOp.setValue(100);
        }
        shapeLayer.property("ADBE Position").setValue(position);
        shapeLayer.startTime = startTime;
        if (duration > 0) { shapeLayer.outPoint = startTime + duration; }
        return JSON.stringify({
            status: "success", message: "Shape layer created successfully",
            layer: { name: shapeLayer.name, index: shapeLayer.index, type: "shape", shapeType: shapeType, inPoint: shapeLayer.inPoint, outPoint: shapeLayer.outPoint, position: shapeLayer.property("ADBE Position").value }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}


function createSolidLayer(args) {
    try {
        var compName = args.compName || "";
        var color = args.color || [1, 1, 1]; 
        var name = args.name || "Solid Layer";
        var position = args.position || [960, 540]; 
        var size = args.size; 
        var startTime = args.startTime || 0;
        var duration = args.duration || 5; 
        var isAdjustment = args.isAdjustment || false; 
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; } 
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }
        if (!size) { size = [comp.width, comp.height]; }
        var solidLayer;
        if (isAdjustment) {
            solidLayer = comp.layers.addSolid([0, 0, 0], name, size[0], size[1], 1);
            solidLayer.adjustmentLayer = true;
        } else {
            solidLayer = comp.layers.addSolid(color, name, size[0], size[1], 1);
        }
        solidLayer.property("ADBE Position").setValue(position);
        solidLayer.startTime = startTime;
        if (duration > 0) { solidLayer.outPoint = startTime + duration; }
        return JSON.stringify({
            status: "success", message: isAdjustment ? "Adjustment layer created successfully" : "Solid layer created successfully",
            layer: { name: solidLayer.name, index: solidLayer.index, type: isAdjustment ? "adjustment" : "solid", inPoint: solidLayer.inPoint, outPoint: solidLayer.outPoint, position: solidLayer.property("ADBE Position").value, isAdjustment: solidLayer.adjustmentLayer }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}


function setLayerProperties(args) {
    try {
        var compName = args.compName || "";
        var layerName = args.layerName || "";
        var layerIndex = args.layerIndex; 
        
        
        var position = args.position; 
        var scale = args.scale; 
        var rotation = args.rotation; 
        var opacity = args.opacity; 
        var startTime = args.startTime; 
        var duration = args.duration; 

        
        var textContent = args.text; 
        var fontFamily = args.fontFamily; 
        var fontSize = args.fontSize; 
        var fillColor = args.fillColor; 
        
        
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; } 
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }
        
        
        var layer = null;
        if (layerIndex !== undefined && layerIndex !== null) {
            if (layerIndex > 0 && layerIndex <= comp.numLayers) { layer = comp.layer(layerIndex); } 
            else { throw new Error("Layer index out of bounds: " + layerIndex); }
        } else if (layerName) {
            for (var j = 1; j <= comp.numLayers; j++) {
                if (comp.layer(j).name === layerName) { layer = comp.layer(j); break; }
            }
        }
        if (!layer) { throw new Error("Layer not found: " + (layerName || "index " + layerIndex)); }
        
        var changedProperties = [];
        var textDocumentChanged = false;
        var textProp = null;
        var textDocument = null;

        
        if (layer instanceof TextLayer && (textContent !== undefined || fontFamily !== undefined || fontSize !== undefined || fillColor !== undefined)) {
            var sourceTextProp = layer.property("ADBE Text Properties").property("ADBE Text Document");
            if (sourceTextProp && sourceTextProp.value) {
                var currentTextDocument = sourceTextProp.value; 
                var updated = false;

                if (textContent !== undefined && textContent !== null && currentTextDocument.text !== textContent) {
                    currentTextDocument.text = textContent;
                    changedProperties.push("text");
                    updated = true;
                }
                if (fontFamily !== undefined && fontFamily !== null && currentTextDocument.font !== fontFamily) {
                    
                    
                    currentTextDocument.font = fontFamily;
                    changedProperties.push("fontFamily");
                    updated = true;
                }
                if (fontSize !== undefined && fontSize !== null && currentTextDocument.fontSize !== fontSize) {
                    currentTextDocument.fontSize = fontSize;
                    changedProperties.push("fontSize");
                    updated = true;
                }
                
                
                if (fillColor !== undefined && fillColor !== null && 
                    (currentTextDocument.fillColor[0] !== fillColor[0] || 
                     currentTextDocument.fillColor[1] !== fillColor[1] || 
                     currentTextDocument.fillColor[2] !== fillColor[2])) {
                    currentTextDocument.fillColor = fillColor;
                    changedProperties.push("fillColor");
                    updated = true;
                }

                // Arabic / RTL handling for the (possibly updated) text content.
                var rtlText = (textContent !== undefined && textContent !== null) ? textContent : currentTextDocument.text;
                if (args.direction !== undefined || _hasArabic(rtlText)) {
                    if (_applyTextDirection(currentTextDocument, rtlText, args.direction)) { changedProperties.push("direction"); }
                    updated = true;
                }

                
                if (updated) {
                    try {
                        sourceTextProp.setValue(currentTextDocument);
                        logToPanel("Applied changes to Text Document for layer: " + layer.name);
                    } catch (e) {
                        logToPanel("ERROR applying Text Document changes: " + e.toString());
                        
                        
                    }
                }
                 
                 textDocument = currentTextDocument; 

            } else {
                logToPanel("Warning: Could not access Source Text property for layer: " + layer.name);
            }
        }

        
        if (position !== undefined && position !== null) { layer.property("ADBE Position").setValue(position); changedProperties.push("position"); }
        if (scale !== undefined && scale !== null) { layer.property("ADBE Scale").setValue(scale); changedProperties.push("scale"); }
        if (rotation !== undefined && rotation !== null) {
            if (layer.threeDLayer) { 
                
                layer.property("ADBE Rotate Z").setValue(rotation);
            } else { 
                layer.property("ADBE Rotate Z").setValue(rotation); 
            }
            changedProperties.push("rotation");
        }
        if (opacity !== undefined && opacity !== null) { layer.property("ADBE Opacity").setValue(opacity); changedProperties.push("opacity"); }
        if (startTime !== undefined && startTime !== null) { layer.startTime = startTime; changedProperties.push("startTime"); }
        if (duration !== undefined && duration !== null && duration > 0) {
            var actualStartTime = (startTime !== undefined && startTime !== null) ? startTime : layer.startTime;
            layer.outPoint = actualStartTime + duration;
            changedProperties.push("duration");
        }

        
        var returnLayerInfo = {
            name: layer.name,
            index: layer.index,
            position: layer.property("ADBE Position").value,
            scale: layer.property("ADBE Scale").value,
            rotation: layer.threeDLayer ? layer.property("ADBE Rotate Z").value : layer.property("ADBE Rotate Z").value, 
            opacity: layer.property("ADBE Opacity").value,
            inPoint: layer.inPoint,
            outPoint: layer.outPoint,
            changedProperties: changedProperties
        };
        
        if (layer instanceof TextLayer && textDocument) {
            returnLayerInfo.text = textDocument.text;
            returnLayerInfo.fontFamily = textDocument.font;
            returnLayerInfo.fontSize = textDocument.fontSize;
            returnLayerInfo.fillColor = textDocument.fillColor;
        }

        
        logToPanel("Final check before return:");
        logToPanel("  Changed Properties: " + changedProperties.join(", "));
        logToPanel("  Return Layer Info Font: " + (returnLayerInfo.fontFamily || "N/A")); 
        logToPanel("  TextDocument Font: " + (textDocument ? textDocument.font : "N/A"));

        return JSON.stringify({
            status: "success", message: "Layer properties updated successfully",
            layer: returnLayerInfo
        }, null, 2);
    } catch (error) {
        
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function coerceScriptValue(rawValue) {
    if (rawValue === undefined || rawValue === null) {
        return rawValue;
    }

    if (typeof rawValue !== "string") {
        return rawValue;
    }

    var trimmed = rawValue.replace(/^\s+|\s+$/g, "");
    if (trimmed === "") {
        return rawValue;
    }

    
    var firstChar = trimmed.charAt(0);
    if (firstChar === "[" || firstChar === "{" || firstChar === '"' || trimmed === "true" || trimmed === "false" || trimmed === "null") {
        try {
            return JSON.parse(trimmed);
        } catch (e) {
            
        }
    }

    
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return parseFloat(trimmed);
    }

    return rawValue;
}


function setLayerKeyframe(compIndex, layerIndex, propertyName, timeInSeconds, value) {
    try {
        
        var comp = app.project.items[compIndex];
        if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ success: false, message: "Composition not found at index " + compIndex });
        }
        var layer = comp.layers[layerIndex];
        if (!layer) {
            return JSON.stringify({ success: false, message: "Layer not found at index " + layerIndex + " in composition '" + comp.name + "'"});
        }

        var transformGroup = layer.property("ADBE Transform Group");
        if (!transformGroup) {
             return JSON.stringify({ success: false, message: "Transform properties not found for layer '" + layer.name + "' (type: " + layer.matchName + ")." });
        }

        var property = transformGroup.property(propertyName);
        if (!property) {
            
             if (layer.property("ADBE Effect Parade") && layer.property("ADBE Effect Parade").property(propertyName)) {
                 property = layer.property("ADBE Effect Parade").property(propertyName);
             } else if (layer.property("ADBE Text Properties") && layer.property("ADBE Text Properties").property(propertyName)) {
                 property = layer.property("ADBE Text Properties").property(propertyName);
            } 

            if (!property) {
                 return JSON.stringify({ success: false, message: "Property '" + propertyName + "' not found on layer '" + layer.name + "'." });
            }
        }


        
        if (!property.canVaryOverTime) {
             return JSON.stringify({ success: false, message: "Property '" + propertyName + "' cannot be keyframed." });
        }

        
        if (property.numKeys === 0 && !property.isTimeVarying) {
             property.setValueAtTime(comp.time, property.value); 
        }


        var normalizedValue = coerceScriptValue(value);
        property.setValueAtTime(timeInSeconds, normalizedValue);

        return JSON.stringify({ success: true, message: "Keyframe set for '" + propertyName + "' on layer '" + layer.name + "' at " + timeInSeconds + "s.", value: normalizedValue });
    } catch (e) {
        return JSON.stringify({ success: false, message: "Error setting keyframe: " + e.toString() + " (Line: " + e.line + ")" });
    }
}



function setLayerExpression(compIndex, layerIndex, propertyName, expressionString) {
    try {
         
        var comp = app.project.items[compIndex];
         if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ success: false, message: "Composition not found at index " + compIndex });
        }
        var layer = comp.layers[layerIndex];
         if (!layer) {
            return JSON.stringify({ success: false, message: "Layer not found at index " + layerIndex + " in composition '" + comp.name + "'"});
        }

        var transformGroup = layer.property("ADBE Transform Group");
         if (!transformGroup) {
             
             
        }

        var property = transformGroup ? transformGroup.property(propertyName) : null;
         if (!property) {
            
             if (layer.property("ADBE Effect Parade") && layer.property("ADBE Effect Parade").property(propertyName)) {
                 property = layer.property("ADBE Effect Parade").property(propertyName);
             } else if (layer.property("ADBE Text Properties") && layer.property("ADBE Text Properties").property(propertyName)) {
                 property = layer.property("ADBE Text Properties").property(propertyName);
             } 

            if (!property) {
                 return JSON.stringify({ success: false, message: "Property '" + propertyName + "' not found on layer '" + layer.name + "'." });
            }
        }

        if (!property.canSetExpression) {
            return JSON.stringify({ success: false, message: "Property '" + propertyName + "' does not support expressions." });
        }

        property.expression = expressionString;

        var action = expressionString === "" ? "removed" : "set";
        return JSON.stringify({ success: true, message: "Expression " + action + " for '" + propertyName + "' on layer '" + layer.name + "'." });
    } catch (e) {
        return JSON.stringify({ success: false, message: "Error setting expression: " + e.toString() + " (Line: " + e.line + ")" });
    }
}

function tryAddEffect(layer, identifier, mode) {
    if (!identifier) {
        return null;
    }

    try {
        if (mode === "matchName") {
            return layer.Effects.addProperty(identifier);
        }
        if (mode === "name") {
            return layer.Effects.addProperty(identifier);
        }
    } catch (e) {
        return null;
    }

    return null;
}

function addEffectByAnyIdentifier(layer, effectIdentifier, effectName, effectMatchName) {
    var attempts = [];
    var effect = null;

    if (effectMatchName) {
        attempts.push({ value: effectMatchName, mode: "matchName" });
    }

    if (effectIdentifier) {
        attempts.push({ value: effectIdentifier, mode: "matchName" });
        attempts.push({ value: effectIdentifier, mode: "name" });
    }

    if (effectName) {
        attempts.push({ value: effectName, mode: "name" });
    }

    for (var i = 0; i < attempts.length; i++) {
        effect = tryAddEffect(layer, attempts[i].value, attempts[i].mode);
        if (effect) {
            return {
                effect: effect,
                resolvedBy: attempts[i]
            };
        }
    }

    return null;
}


function applyEffect(args) {
    try {
        
        var compIndex = args.compIndex || 1; 
        var layerIndex = args.layerIndex || 1; 
        var effectIdentifier = args.effect || args.effectIdentifier; 
        var effectName = args.effectName; 
        var effectMatchName = args.effectMatchName; 
        var effectCategory = args.effectCategory || ""; 
        var presetPath = args.presetPath; 
        var effectSettings = args.effectSettings || {}; 
        
        if (!effectIdentifier && !effectName && !effectMatchName && !presetPath) {
            throw new Error("You must specify effect, effectIdentifier, effectName, effectMatchName, or presetPath");
        }
        
        
        var comp = app.project.item(compIndex);
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("Composition not found at index " + compIndex);
        }
        
        
        var layer = comp.layer(layerIndex);
        if (!layer) {
            throw new Error("Layer not found at index " + layerIndex + " in composition '" + comp.name + "'");
        }
        
        var effectResult;
        
        
        if (presetPath) {
            var presetFile = new File(presetPath);
            if (!presetFile.exists) {
                throw new Error("Effect preset file not found: " + presetPath);
            }
            
            
            layer.applyPreset(presetFile);
            effectResult = {
                type: "preset",
                name: presetPath.split('/').pop().split('\\').pop(),
                applied: true
            };
        }
        
        else if (effectMatchName || effectName || effectIdentifier) {
            var added = addEffectByAnyIdentifier(layer, effectIdentifier, effectName, effectMatchName);
            if (!added || !added.effect) {
                throw new Error("Could not add effect. Try a valid effectMatchName (for example: 'ADBE Gaussian Blur 2') or exact effect display name.");
            }

            var effect = added.effect;
            effectResult = {
                type: "effect",
                name: effect.name,
                matchName: effect.matchName,
                index: effect.propertyIndex,
                resolvedBy: added.resolvedBy
            };
            
            
            applyEffectSettings(effect, effectSettings);
        }
        
        return JSON.stringify({
            status: "success",
            message: "Effect applied successfully",
            effect: effectResult,
            layer: {
                name: layer.name,
                index: layerIndex
            },
            composition: {
                name: comp.name,
                index: compIndex
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}


function applyEffectSettings(effect, settings) {
    
    var hasAnySetting = false;
    if (!settings) {
        return;
    }
    for (var key in settings) {
        if (settings.hasOwnProperty(key)) {
            hasAnySetting = true;
            break;
        }
    }
    if (!hasAnySetting) {
        return;
    }
    
    
    for (var propName in settings) {
        if (settings.hasOwnProperty(propName)) {
            try {
                
                var property = null;
                
                
                try {
                    property = effect.property(propName);
                } catch (e) {
                    
                    for (var i = 1; i <= effect.numProperties; i++) {
                        var prop = effect.property(i);
                        if (prop.name === propName) {
                            property = prop;
                            break;
                        }
                    }
                }
                
                
                if (property && property.setValue) {
                    property.setValue(coerceScriptValue(settings[propName]));
                }
            } catch (e) {
                
                $.writeln("Error setting effect property '" + propName + "': " + e.toString());
            }
        }
    }
}

function findPropertyByNameOrMatchName(container, propertyName) {
    if (!container || !propertyName || !container.numProperties) {
        return null;
    }

    for (var i = 1; i <= container.numProperties; i++) {
        var candidate = container.property(i);
        if (candidate && (candidate.name === propertyName || candidate.matchName === propertyName)) {
            return candidate;
        }
    }

    return null;
}

function resolvePropertyPath(rootProperty, pathTokens) {
    var current = rootProperty;

    for (var i = 0; i < pathTokens.length; i++) {
        if (!current) {
            return null;
        }

        var token = pathTokens[i];
        var nextProperty = null;

        if (typeof token === "number") {
            nextProperty = current.property(token);
        } else {
            nextProperty = current.property(token);
            if (!nextProperty) {
                nextProperty = findPropertyByNameOrMatchName(current, token);
            }
        }

        current = nextProperty;
    }

    return current;
}

function normalizePropertyPath(pathInput) {
    if (pathInput instanceof Array) {
        return pathInput;
    }

    if (typeof pathInput === "string" && pathInput.length > 0) {
        return pathInput.split("/");
    }

    return [];
}

function readPropertyValue(prop) {
    try {
        if (!prop || prop.propertyType === PropertyType.NAMED_GROUP || prop.propertyType === PropertyType.INDEXED_GROUP) {
            return null;
        }
        return prop.value;
    } catch (e) {
        return null;
    }
}

function serializeEffectProperty(prop, includeValues, currentDepth, maxDepth) {
    var propertyInfo = {
        name: prop.name,
        matchName: prop.matchName,
        index: prop.propertyIndex,
        canSetExpression: !!prop.canSetExpression,
        canVaryOverTime: !!prop.canVaryOverTime,
        numKeys: prop.numKeys || 0,
        isGroup: prop.propertyType === PropertyType.NAMED_GROUP || prop.propertyType === PropertyType.INDEXED_GROUP,
        children: []
    };

    if (includeValues) {
        propertyInfo.value = readPropertyValue(prop);
    }

    if (propertyInfo.isGroup && currentDepth < maxDepth && prop.numProperties) {
        for (var i = 1; i <= prop.numProperties; i++) {
            var child = prop.property(i);
            if (child) {
                propertyInfo.children.push(serializeEffectProperty(child, includeValues, currentDepth + 1, maxDepth));
            }
        }
    }

    return propertyInfo;
}

function resolveCompAndLayer(args) {
    var compIndex = args.compIndex || 1;
    var layerIndex = args.layerIndex || 1;

    var comp = app.project.item(compIndex);
    if (!comp || !(comp instanceof CompItem)) {
        throw new Error("Composition not found at index " + compIndex);
    }

    var layer = comp.layer(layerIndex);
    if (!layer) {
        throw new Error("Layer not found at index " + layerIndex + " in composition '" + comp.name + "'");
    }

    return {
        comp: comp,
        layer: layer,
        compIndex: compIndex,
        layerIndex: layerIndex
    };
}

function resolveEffectOnLayer(layer, args) {
    var effectsGroup = layer.property("ADBE Effect Parade");
    if (!effectsGroup) {
        throw new Error("Layer has no Effects group");
    }

    var effect = null;

    if (args.effectIndex !== undefined && args.effectIndex !== null) {
        effect = effectsGroup.property(args.effectIndex);
    }

    if (!effect && args.effectName) {
        effect = findPropertyByNameOrMatchName(effectsGroup, args.effectName);
    }

    if (!effect && args.effectMatchName) {
        effect = findPropertyByNameOrMatchName(effectsGroup, args.effectMatchName);
    }

    if (!effect) {
        throw new Error("Effect not found on layer. Provide effectIndex, effectName, or effectMatchName.");
    }

    return effect;
}

function listLayerEffects(args) {
    try {
        var resolved = resolveCompAndLayer(args || {});
        var layer = resolved.layer;
        var effectsGroup = layer.property("ADBE Effect Parade");
        var includeProperties = !!args.includeProperties;
        var includeValues = !!args.includeValues;
        var maxDepth = args.maxDepth || 2;

        var effects = [];
        if (effectsGroup && effectsGroup.numProperties) {
            for (var i = 1; i <= effectsGroup.numProperties; i++) {
                var effect = effectsGroup.property(i);
                var effectInfo = {
                    index: effect.propertyIndex,
                    name: effect.name,
                    matchName: effect.matchName,
                    enabled: effect.enabled
                };

                if (includeProperties) {
                    effectInfo.properties = [];
                    for (var j = 1; j <= effect.numProperties; j++) {
                        var child = effect.property(j);
                        effectInfo.properties.push(serializeEffectProperty(child, includeValues, 1, maxDepth));
                    }
                }

                effects.push(effectInfo);
            }
        }

        return JSON.stringify({
            status: "success",
            composition: {
                name: resolved.comp.name,
                index: resolved.compIndex
            },
            layer: {
                name: layer.name,
                index: resolved.layerIndex
            },
            effectCount: effects.length,
            effects: effects
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

function listAvailableEffects(args) {
    try {
        var params = args || {};
        var query = params.query ? String(params.query).toLowerCase() : "";
        var includeObsolete = !!params.includeObsolete;
        var maxResults = (params.maxResults !== undefined && params.maxResults !== null)
            ? Number(params.maxResults)
            : 5000;

        if (!app.effects) {
            throw new Error("After Effects app.effects API is not available in this version.");
        }

        var effectsCollection = app.effects;
        var collectionCount = 0;
        if (effectsCollection.length !== undefined && effectsCollection.length !== null) {
            collectionCount = Number(effectsCollection.length);
        } else if (effectsCollection.numEffects !== undefined && effectsCollection.numEffects !== null) {
            collectionCount = Number(effectsCollection.numEffects);
        }

        var effects = [];
        for (var i = 0; i < collectionCount; i++) {
            var effectObj = null;
            try {
                effectObj = effectsCollection[i];
            } catch (e1) {
                effectObj = null;
            }
            if (!effectObj && effectsCollection.effect) {
                try {
                    effectObj = effectsCollection.effect(i + 1);
                } catch (e2) {
                    effectObj = null;
                }
            }
            if (!effectObj) {
                continue;
            }

            var name = "";
            var matchName = "";
            var category = "";
            var isObsolete = false;

            try { name = effectObj.displayName || effectObj.name || ""; } catch (e3) {}
            try { matchName = effectObj.matchName || ""; } catch (e4) {}
            try { category = effectObj.category || ""; } catch (e5) {}
            try { isObsolete = !!effectObj.isObsolete; } catch (e6) {}

            if (!includeObsolete && isObsolete) {
                continue;
            }

            if (query) {
                var haystack = (String(name) + " " + String(matchName) + " " + String(category)).toLowerCase();
                if (haystack.indexOf(query) === -1) {
                    continue;
                }
            }

            effects.push({
                index: i,
                name: name,
                matchName: matchName,
                category: category,
                isObsolete: isObsolete
            });

            if (effects.length >= maxResults) {
                break;
            }
        }

        return JSON.stringify({
            status: "success",
            query: query || null,
            includeObsolete: includeObsolete,
            returnedCount: effects.length,
            totalScanned: collectionCount,
            effects: effects
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

function getInterpolationTypeByName(name) {
    if (!name) {
        return null;
    }

    var normalized = String(name).toLowerCase();
    if (normalized === "linear") {
        return KeyframeInterpolationType.LINEAR;
    }
    if (normalized === "bezier") {
        return KeyframeInterpolationType.BEZIER;
    }
    if (normalized === "hold") {
        return KeyframeInterpolationType.HOLD;
    }

    return null;
}

function getPropertyDimensionCount(property) {
    try {
        var value = property.value;
        if (value instanceof Array) {
            return value.length;
        }
    } catch (e) {
        
    }
    return 1;
}

function findKeyIndexAtTime(property, timeInSeconds) {
    var epsilon = 0.0001;
    for (var i = 1; i <= property.numKeys; i++) {
        if (Math.abs(property.keyTime(i) - timeInSeconds) <= epsilon) {
            return i;
        }
    }
    return -1;
}

function buildEaseArray(dimensionCount, speed, influence) {
    var easeArray = [];
    var resolvedSpeed = (speed !== undefined && speed !== null) ? Number(speed) : 0;
    var resolvedInfluence = (influence !== undefined && influence !== null) ? Number(influence) : 33.333;

    for (var i = 0; i < dimensionCount; i++) {
        easeArray.push(new KeyframeEase(resolvedSpeed, resolvedInfluence));
    }

    return easeArray;
}

function buildEaseArrayFromSpec(dimensionCount, spec, fallbackSpeed, fallbackInfluence) {
    if (spec instanceof Array) {
        var result = [];
        for (var i = 0; i < dimensionCount; i++) {
            var item = spec[i] || spec[spec.length - 1] || {};
            var itemSpeed = (item.speed !== undefined && item.speed !== null) ? Number(item.speed) : fallbackSpeed;
            var itemInfluence = (item.influence !== undefined && item.influence !== null) ? Number(item.influence) : fallbackInfluence;
            result.push(new KeyframeEase(itemSpeed, itemInfluence));
        }
        return result;
    }

    var speed = spec && spec.speed;
    var influence = spec && spec.influence;
    return buildEaseArray(
        dimensionCount,
        (speed !== undefined && speed !== null) ? speed : fallbackSpeed,
        (influence !== undefined && influence !== null) ? influence : fallbackInfluence
    );
}

function getKeyframeOptionsFromArgs(args) {
    var options = args.keyframeOptions || {};

    
    if (args.easyEase !== undefined) {
        options.easyEase = args.easyEase;
    }
    if (args.interpolationIn !== undefined) {
        options.interpolationIn = args.interpolationIn;
    }
    if (args.interpolationOut !== undefined) {
        options.interpolationOut = args.interpolationOut;
    }
    if (args.temporalContinuous !== undefined) {
        options.temporalContinuous = args.temporalContinuous;
    }
    if (args.temporalAutoBezier !== undefined) {
        options.temporalAutoBezier = args.temporalAutoBezier;
    }
    if (args.roving !== undefined) {
        options.roving = args.roving;
    }
    if (args.easeIn !== undefined) {
        options.easeIn = args.easeIn;
    }
    if (args.easeOut !== undefined) {
        options.easeOut = args.easeOut;
    }
    if (args.spatialTangentsIn !== undefined) {
        options.spatialTangentsIn = args.spatialTangentsIn;
    }
    if (args.spatialTangentsOut !== undefined) {
        options.spatialTangentsOut = args.spatialTangentsOut;
    }
    if (args.spatialContinuous !== undefined) {
        options.spatialContinuous = args.spatialContinuous;
    }
    if (args.spatialAutoBezier !== undefined) {
        options.spatialAutoBezier = args.spatialAutoBezier;
    }

    return options;
}

function applyKeyframeGraphOptions(property, keyIndex, options) {
    if (!options) {
        return;
    }

    var dimensionCount = getPropertyDimensionCount(property);

    if (options.easyEase) {
        var easyInfluence = (options.easyEaseInfluence !== undefined && options.easyEaseInfluence !== null)
            ? Number(options.easyEaseInfluence)
            : 33.333;
        var easyIn = buildEaseArray(dimensionCount, 0, easyInfluence);
        var easyOut = buildEaseArray(dimensionCount, 0, easyInfluence);
        property.setTemporalEaseAtKey(keyIndex, easyIn, easyOut);
    }

    if (options.easeIn || options.easeOut) {
        var inEase = buildEaseArrayFromSpec(dimensionCount, options.easeIn, 0, 33.333);
        var outEase = buildEaseArrayFromSpec(dimensionCount, options.easeOut, 0, 33.333);
        property.setTemporalEaseAtKey(keyIndex, inEase, outEase);
    }

    var inInterpolation = getInterpolationTypeByName(options.interpolationIn);
    var outInterpolation = getInterpolationTypeByName(options.interpolationOut);
    if (inInterpolation || outInterpolation) {
        if (!inInterpolation) {
            inInterpolation = property.keyInInterpolationType(keyIndex);
        }
        if (!outInterpolation) {
            outInterpolation = property.keyOutInterpolationType(keyIndex);
        }
        property.setInterpolationTypeAtKey(keyIndex, inInterpolation, outInterpolation);
    }

    if (options.temporalContinuous !== undefined) {
        property.setTemporalContinuousAtKey(keyIndex, !!options.temporalContinuous);
    }

    if (options.temporalAutoBezier !== undefined) {
        property.setTemporalAutoBezierAtKey(keyIndex, !!options.temporalAutoBezier);
    }

    if (options.roving !== undefined) {
        try {
            property.setRovingAtKey(keyIndex, !!options.roving);
        } catch (e) {
            
        }
    }

    if (options.spatialTangentsIn !== undefined || options.spatialTangentsOut !== undefined) {
        try {
            var inTangent = options.spatialTangentsIn;
            var outTangent = options.spatialTangentsOut;
            if (inTangent === undefined || inTangent === null) {
                inTangent = property.keyInSpatialTangent(keyIndex);
            }
            if (outTangent === undefined || outTangent === null) {
                outTangent = property.keyOutSpatialTangent(keyIndex);
            }
            property.setSpatialTangentsAtKey(keyIndex, inTangent, outTangent);
        } catch (e) {
            
        }
    }

    if (options.spatialContinuous !== undefined) {
        try {
            property.setSpatialContinuousAtKey(keyIndex, !!options.spatialContinuous);
        } catch (e) {
            
        }
    }

    if (options.spatialAutoBezier !== undefined) {
        try {
            property.setSpatialAutoBezierAtKey(keyIndex, !!options.spatialAutoBezier);
        } catch (e) {
            
        }
    }
}

function setEffectProperty(args) {
    try {
        var resolved = resolveCompAndLayer(args || {});
        var effect = resolveEffectOnLayer(resolved.layer, args || {});
        var propertyPath = normalizePropertyPath(args.propertyPath);
        var targetProperty = null;

        if (propertyPath.length > 0) {
            targetProperty = resolvePropertyPath(effect, propertyPath);
        }

        if (!targetProperty && args.propertyName) {
            targetProperty = findPropertyByNameOrMatchName(effect, args.propertyName);
        }

        if (!targetProperty && args.propertyIndex !== undefined && args.propertyIndex !== null) {
            targetProperty = effect.property(args.propertyIndex);
        }

        if (!targetProperty) {
            throw new Error("Target effect property not found. Provide propertyPath, propertyName, or propertyIndex.");
        }

        var previousValue = readPropertyValue(targetProperty);

        if (args.expressionString !== undefined && args.expressionString !== null) {
            if (!targetProperty.canSetExpression) {
                throw new Error("Property '" + targetProperty.name + "' does not support expressions.");
            }
            targetProperty.expression = args.expressionString;
        }

        var keyframeIndex = (args.keyframeIndex !== undefined && args.keyframeIndex !== null)
            ? Number(args.keyframeIndex)
            : -1;
        var keyframeApplied = false;

        if (args.value !== undefined) {
            if (args.timeInSeconds !== undefined && args.timeInSeconds !== null) {
                if (!targetProperty.canVaryOverTime) {
                    throw new Error("Property '" + targetProperty.name + "' cannot be keyframed.");
                }
                targetProperty.setValueAtTime(args.timeInSeconds, coerceScriptValue(args.value));
            } else if (keyframeIndex > 0 && targetProperty.setValueAtKey) {
                targetProperty.setValueAtKey(keyframeIndex, coerceScriptValue(args.value));
            } else if (targetProperty.setValue) {
                targetProperty.setValue(coerceScriptValue(args.value));
            } else {
                throw new Error("Property '" + targetProperty.name + "' is not directly writable.");
            }
        }

        if (args.timeInSeconds !== undefined && args.timeInSeconds !== null) {
            keyframeIndex = findKeyIndexAtTime(targetProperty, args.timeInSeconds);
            if (keyframeIndex < 0) {
                throw new Error("Could not find keyframe at the requested time after update.");
            }
        }

        var graphOptions = getKeyframeOptionsFromArgs(args);
        var hasGraphOptions = false;
        for (var graphKey in graphOptions) {
            if (graphOptions.hasOwnProperty(graphKey)) {
                hasGraphOptions = true;
                break;
            }
        }

        if (keyframeIndex > 0 && (hasGraphOptions || (args.timeInSeconds !== undefined && args.timeInSeconds !== null))) {
            applyKeyframeGraphOptions(targetProperty, keyframeIndex, graphOptions);
            keyframeApplied = true;
        }

        return JSON.stringify({
            status: "success",
            message: "Effect property updated successfully",
            composition: {
                name: resolved.comp.name,
                index: resolved.compIndex
            },
            layer: {
                name: resolved.layer.name,
                index: resolved.layerIndex
            },
            effect: {
                index: effect.propertyIndex,
                name: effect.name,
                matchName: effect.matchName
            },
            property: {
                name: targetProperty.name,
                matchName: targetProperty.matchName,
                index: targetProperty.propertyIndex,
                previousValue: previousValue,
                currentValue: readPropertyValue(targetProperty),
                expressionEnabled: targetProperty.canSetExpression ? (targetProperty.expression !== "") : false,
                keyframeApplied: keyframeApplied,
                keyframeIndex: keyframeIndex
            },
            keyframeTimeInSeconds: (args.timeInSeconds !== undefined && args.timeInSeconds !== null) ? args.timeInSeconds : null
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

function setEffectKeyframe(args) {
    if ((args.timeInSeconds === undefined || args.timeInSeconds === null) &&
        (args.keyframeIndex === undefined || args.keyframeIndex === null)) {
        return JSON.stringify({
            status: "error",
            message: "timeInSeconds or keyframeIndex is required for setEffectKeyframe"
        }, null, 2);
    }

    if (args.value === undefined) {
        return JSON.stringify({
            status: "error",
            message: "value is required for setEffectKeyframe"
        }, null, 2);
    }

    return setEffectProperty(args);
}

function applyLayerPreset(args) {
    try {
        var resolved = resolveCompAndLayer(args || {});
        var presetPath = args.presetPath;

        if (!presetPath) {
            throw new Error("presetPath is required.");
        }

        var presetFile = new File(presetPath);
        if (!presetFile.exists) {
            throw new Error("Preset file not found: " + presetPath);
        }

        resolved.layer.applyPreset(presetFile);

        return JSON.stringify({
            status: "success",
            message: "Preset applied successfully",
            composition: {
                name: resolved.comp.name,
                index: resolved.compIndex
            },
            layer: {
                name: resolved.layer.name,
                index: resolved.layerIndex
            },
            presetPath: presetFile.fsName
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

function createAdjustmentLayer(args) {
    try {
        var params = args || {};
        var compName = params.compName || "";
        var name = params.name || "Adjustment Layer";
        var position = params.position;
        var size = params.size;
        var startTime = params.startTime || 0;
        var duration = params.duration || 5;

        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) {
                comp = item;
                break;
            }
        }

        if (!comp) {
            if (app.project.activeItem instanceof CompItem) {
                comp = app.project.activeItem;
            } else {
                throw new Error("No composition found with name '" + compName + "' and no active composition");
            }
        }

        if (!size) {
            size = [comp.width, comp.height];
        }

        if (!position) {
            position = [comp.width / 2, comp.height / 2];
        }

        var adjustmentLayer = comp.layers.addSolid([0, 0, 0], name, size[0], size[1], 1);
        adjustmentLayer.adjustmentLayer = true;
        adjustmentLayer.property("ADBE Position").setValue(position);
        adjustmentLayer.startTime = startTime;
        if (duration > 0) {
            adjustmentLayer.outPoint = startTime + duration;
        }

        return JSON.stringify({
            status: "success",
            message: "Adjustment layer created successfully",
            layer: {
                name: adjustmentLayer.name,
                index: adjustmentLayer.index,
                type: "adjustment",
                inPoint: adjustmentLayer.inPoint,
                outPoint: adjustmentLayer.outPoint,
                position: adjustmentLayer.property("ADBE Position").value,
                isAdjustment: adjustmentLayer.adjustmentLayer
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

function centerLayers(args) {
    try {
        var params = args || {};
        var compIndex = params.compIndex || 1;
        var comp = app.project.item(compIndex);
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("Composition not found at index " + compIndex);
        }
        var centerX = comp.width / 2;
        var centerY = comp.height / 2;
        var centered = [];

        function centerOneLayer(layer) {
            if (!layer) {
                return;
            }
            var positionProp = layer.property("ADBE Transform Group").property("ADBE Position");
            if (!positionProp || !positionProp.setValue) {
                return;
            }

            var current = positionProp.value;
            var nextValue = null;
            if (current instanceof Array && current.length >= 3) {
                nextValue = [centerX, centerY, current[2]];
            } else {
                nextValue = [centerX, centerY];
            }
            positionProp.setValue(nextValue);

            centered.push({
                index: layer.index,
                name: layer.name,
                position: nextValue
            });
        }

        if (params.allLayers) {
            for (var i = 1; i <= comp.numLayers; i++) {
                centerOneLayer(comp.layer(i));
            }
        } else if (params.selectedOnly) {
            var selected = comp.selectedLayers || [];
            for (var j = 0; j < selected.length; j++) {
                centerOneLayer(selected[j]);
            }
        } else if (params.layerName) {
            var target = null;
            for (var k = 1; k <= comp.numLayers; k++) {
                if (comp.layer(k).name === params.layerName) {
                    target = comp.layer(k);
                    break;
                }
            }
            if (!target) {
                throw new Error("Layer not found with name '" + params.layerName + "'.");
            }
            centerOneLayer(target);
        } else {
            centerOneLayer(comp.layer(params.layerIndex || 1));
        }

        return JSON.stringify({
            status: "success",
            message: "Layer centering completed",
            composition: {
                name: comp.name,
                index: compIndex,
                center: [centerX, centerY]
            },
            centeredCount: centered.length,
            centeredLayers: centered
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

function getLayerClipFrames(args) {
    try {
        var params = args || {};
        var compIndex = params.compIndex || 1;
        var comp = app.project.item(compIndex);
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("Composition not found at index " + compIndex);
        }

        var layer = null;
        if (params.layerIndex !== undefined && params.layerIndex !== null) {
            if (params.layerIndex > 0 && params.layerIndex <= comp.numLayers) {
                layer = comp.layer(params.layerIndex);
            } else {
                throw new Error("Layer index out of bounds: " + params.layerIndex);
            }
        } else if (params.layerName) {
            for (var i = 1; i <= comp.numLayers; i++) {
                if (comp.layer(i).name === params.layerName) {
                    layer = comp.layer(i);
                    break;
                }
            }
            if (!layer) {
                throw new Error("Layer not found with name '" + params.layerName + "'.");
            }
        } else {
            throw new Error("Provide layerIndex or layerName.");
        }

        var frameDuration = comp.frameDuration;
        function toFrameNumber(timeValue) {
            return Math.round(timeValue / frameDuration);
        }

        var clipStartTime = layer.inPoint;
        var clipEndTime = layer.outPoint;
        var layerStartTime = layer.startTime;
        var sourceStartTime = layer.inPoint - layer.startTime;
        var sourceEndTime = layer.outPoint - layer.startTime;

        return JSON.stringify({
            status: "success",
            composition: {
                name: comp.name,
                index: compIndex,
                frameRate: comp.frameRate,
                frameDuration: frameDuration
            },
            layer: {
                name: layer.name,
                index: layer.index,
                sourceName: layer.source ? layer.source.name : null,
                startTimeSeconds: layerStartTime,
                startFrame: toFrameNumber(layerStartTime),
                clipStartTimeSeconds: clipStartTime,
                clipStartFrame: toFrameNumber(clipStartTime),
                clipEndTimeSeconds: clipEndTime,
                clipEndFrame: toFrameNumber(clipEndTime),
                sourceStartTimeSeconds: sourceStartTime,
                sourceStartFrame: toFrameNumber(sourceStartTime),
                sourceEndTimeSeconds: sourceEndTime,
                sourceEndFrame: toFrameNumber(sourceEndTime),
                durationSeconds: clipEndTime - clipStartTime,
                durationFrames: toFrameNumber(clipEndTime - clipStartTime)
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

function getLayerAudioInfo(args) {
    try {
        var params = args || {};
        var compIndex = params.compIndex || 1;
        var comp = app.project.item(compIndex);
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("Composition not found at index " + compIndex);
        }

        var layer = null;
        if (params.layerIndex !== undefined && params.layerIndex !== null) {
            layer = comp.layer(params.layerIndex);
            if (!layer) { throw new Error("Layer not found at index " + params.layerIndex); }
        } else if (params.layerName) {
            for (var i = 1; i <= comp.numLayers; i++) {
                if (comp.layer(i).name === params.layerName) { layer = comp.layer(i); break; }
            }
            if (!layer) { throw new Error("Layer not found with name '" + params.layerName + "'."); }
        } else {
            throw new Error("Provide layerIndex or layerName.");
        }

        var hasAudio = layer.hasAudio || false;
        var audioEnabled = layer.audioEnabled || false;
        var sourceInfo = null;
        var sourceFilePath = null;

        if (layer.source) {
            var src = layer.source;
            sourceInfo = {
                name: src.name,
                hasAudio: src.hasAudio || false,
                audioChannels: src.audioChannels || 0,
                audioSampleRate: src.audioSampleRate || 0,
                audioDuration: src.audioDuration || 0
            };
            if (src.file) {
                sourceFilePath = src.file.fsName;
            }
        }

        var audioLevelsValue = null;
        var audioLevelsKeyframes = [];
        try {
            var audioGroup = layer.property("ADBE Audio Group");
            if (audioGroup) {
                var levProp = null;
                try { levProp = audioGroup.property("ADBE Audio Levels"); } catch (e) {}
                if (!levProp) {
                    for (var j = 1; j <= audioGroup.numProperties; j++) {
                        var ap = audioGroup.property(j);
                        if (ap.matchName === "ADBE Audio Levels" || ap.name === "Audio Levels") {
                            levProp = ap; break;
                        }
                    }
                }
                if (levProp) {
                    audioLevelsValue = levProp.value;
                    for (var k = 1; k <= levProp.numKeys; k++) {
                        audioLevelsKeyframes.push({
                            index: k,
                            timeInSeconds: levProp.keyTime(k),
                            value: levProp.keyValue(k)
                        });
                    }
                }
            }
        } catch (e) {}

        var existingMarkers = [];
        try {
            var markerProp = layer.property("ADBE Marker");
            if (markerProp) {
                for (var m = 1; m <= markerProp.numKeys; m++) {
                    var mv = markerProp.keyValue(m);
                    existingMarkers.push({
                        index: m,
                        timeInSeconds: markerProp.keyTime(m),
                        comment: mv.comment,
                        duration: mv.duration,
                        label: mv.label
                    });
                }
            }
        } catch (e) {}

        return JSON.stringify({
            status: "success",
            composition: { name: comp.name, index: compIndex, frameRate: comp.frameRate },
            layer: {
                name: layer.name,
                index: layer.index,
                hasAudio: hasAudio,
                audioEnabled: audioEnabled,
                inPoint: layer.inPoint,
                outPoint: layer.outPoint
            },
            source: sourceInfo,
            sourceFilePath: sourceFilePath,
            audioLevels: { currentValue: audioLevelsValue, keyframes: audioLevelsKeyframes },
            existingMarkers: existingMarkers
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function addMarkersFromArray(args) {
    try {
        var params = args || {};
        var compIndex = params.compIndex || 1;
        var comp = app.project.item(compIndex);
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("Composition not found at index " + compIndex);
        }

        var markers = params.markers;
        if (!markers || !(markers instanceof Array) || markers.length === 0) {
            throw new Error("markers must be a non-empty array of {timeInSeconds, comment?, duration?, label?} objects.");
        }

        var markerType = params.markerType || "layer";
        var layer = null;

        if (markerType === "layer") {
            if (params.layerIndex !== undefined && params.layerIndex !== null) {
                layer = comp.layer(params.layerIndex);
                if (!layer) { throw new Error("Layer not found at index " + params.layerIndex); }
            } else if (params.layerName) {
                for (var i = 1; i <= comp.numLayers; i++) {
                    if (comp.layer(i).name === params.layerName) { layer = comp.layer(i); break; }
                }
                if (!layer) { throw new Error("Layer not found with name '" + params.layerName + "'."); }
            } else {
                throw new Error("Provide layerIndex or layerName for layer markers, or set markerType to 'comp'.");
            }
        }

        var added = [];
        var errors = [];

        for (var j = 0; j < markers.length; j++) {
            try {
                var spec = markers[j];
                var timeInSeconds = Number(spec.timeInSeconds);
                var mv = new MarkerValue(spec.comment || "");
                mv.duration = (spec.duration !== undefined && spec.duration !== null) ? Number(spec.duration) : 0;
                if (spec.chapter)  { mv.chapter = spec.chapter; }
                if (spec.url)      { mv.url     = spec.url;     }
                if (spec.label)    { mv.label   = Number(spec.label); }

                if (markerType === "comp") {
                    comp.markerProperty.setValueAtTime(timeInSeconds, mv);
                } else {
                    layer.property("ADBE Marker").setValueAtTime(timeInSeconds, mv);
                }
                added.push({ timeInSeconds: timeInSeconds, comment: spec.comment || "" });
            } catch (e) {
                errors.push({ index: j, timeInSeconds: markers[j].timeInSeconds, error: e.toString() });
            }
        }

        return JSON.stringify({
            status: "success",
            message: "Bulk marker insertion complete",
            addedCount: added.length,
            errorCount: errors.length,
            added: added,
            errors: errors,
            composition: { name: comp.name, index: compIndex },
            layer: layer ? { name: layer.name, index: layer.index } : null
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function addMarker(args) {
    try {
        var params = args || {};
        var compIndex = params.compIndex || 1;
        var comp = app.project.item(compIndex);
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("Composition not found at index " + compIndex);
        }

        var timeInSeconds = (params.timeInSeconds !== undefined && params.timeInSeconds !== null)
            ? Number(params.timeInSeconds)
            : comp.time;

        var comment  = params.comment  || "";
        var chapter  = params.chapter  || "";
        var url      = params.url      || "";
        var duration = (params.duration !== undefined && params.duration !== null) ? Number(params.duration) : 0;
        var label    = (params.label   !== undefined && params.label   !== null) ? Number(params.label)   : 0;

        var markerVal = new MarkerValue(comment);
        markerVal.duration = duration;
        if (chapter)  { markerVal.chapter    = chapter;  }
        if (url)      { markerVal.url        = url;      }
        if (label)    { markerVal.label      = label;    }

        var markerType = params.markerType || "layer"; 

        if (markerType === "comp") {
            comp.markerProperty.setValueAtTime(timeInSeconds, markerVal);
            return JSON.stringify({
                status: "success",
                message: "Composition marker added",
                composition: { name: comp.name, index: compIndex },
                marker: { timeInSeconds: timeInSeconds, comment: comment, duration: duration, label: label }
            }, null, 2);
        }

        
        var layer = null;
        if (params.layerIndex !== undefined && params.layerIndex !== null) {
            layer = comp.layer(params.layerIndex);
            if (!layer) { throw new Error("Layer not found at index " + params.layerIndex); }
        } else if (params.layerName) {
            for (var i = 1; i <= comp.numLayers; i++) {
                if (comp.layer(i).name === params.layerName) { layer = comp.layer(i); break; }
            }
            if (!layer) { throw new Error("Layer not found with name '" + params.layerName + "'."); }
        } else {
            throw new Error("Provide layerIndex or layerName for a layer marker, or set markerType to 'comp'.");
        }

        var markerProp = layer.property("ADBE Marker");
        if (!markerProp) { throw new Error("Layer '" + layer.name + "' does not support markers."); }
        markerProp.setValueAtTime(timeInSeconds, markerVal);

        return JSON.stringify({
            status: "success",
            message: "Layer marker added",
            composition: { name: comp.name, index: compIndex },
            layer: { name: layer.name, index: layer.index },
            marker: { timeInSeconds: timeInSeconds, comment: comment, duration: duration, label: label }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function setLayerAudioLevels(args) {
    try {
        var resolved = resolveCompAndLayer(args || {});
        var layer = resolved.layer;

        var audioGroup = layer.property("ADBE Audio Group");
        if (!audioGroup) {
            throw new Error("Layer '" + layer.name + "' has no Audio property. Ensure it is an audio or AV layer.");
        }

        
        var audioLevelsProp = null;
        try { audioLevelsProp = audioGroup.property("ADBE Audio Levels"); } catch (e) {}
        if (!audioLevelsProp) {
            for (var i = 1; i <= audioGroup.numProperties; i++) {
                var p = audioGroup.property(i);
                if (p.matchName === "ADBE Audio Levels" || p.name === "Audio Levels") {
                    audioLevelsProp = p;
                    break;
                }
            }
        }
        if (!audioLevelsProp) {
            throw new Error("Audio Levels property not found on layer '" + layer.name + "'.");
        }

        var level      = (args.level      !== undefined && args.level      !== null) ? Number(args.level)      : null;
        var leftLevel  = (args.leftLevel  !== undefined && args.leftLevel  !== null) ? Number(args.leftLevel)  : level;
        var rightLevel = (args.rightLevel !== undefined && args.rightLevel !== null) ? Number(args.rightLevel) : level;

        if (leftLevel === null && rightLevel === null) {
            throw new Error("Provide level (both channels), leftLevel, or rightLevel in dB.");
        }
        if (leftLevel  === null) { leftLevel  = rightLevel; }
        if (rightLevel === null) { rightLevel = leftLevel;  }

        var levelsValue = [leftLevel, rightLevel];

        if (args.timeInSeconds !== undefined && args.timeInSeconds !== null) {
            if (!audioLevelsProp.canVaryOverTime) {
                throw new Error("Audio Levels property cannot be keyframed on this layer.");
            }
            audioLevelsProp.setValueAtTime(Number(args.timeInSeconds), levelsValue);
        } else {
            audioLevelsProp.setValue(levelsValue);
        }

        return JSON.stringify({
            status: "success",
            message: "Audio levels set successfully",
            composition: { name: resolved.comp.name, index: resolved.compIndex },
            layer: { name: layer.name, index: layer.index },
            audioLevels: {
                left: leftLevel,
                right: rightLevel,
                timeInSeconds: (args.timeInSeconds !== undefined && args.timeInSeconds !== null) ? Number(args.timeInSeconds) : null
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function removeLayerEffect(args) {
    try {
        var resolved = resolveCompAndLayer(args || {});
        var effectsGroup = resolved.layer.property("ADBE Effect Parade");

        if (!effectsGroup || effectsGroup.numProperties === 0) {
            return JSON.stringify({
                status: "success",
                message: "Layer has no effects to remove",
                removedCount: 0
            }, null, 2);
        }

        var removeAll = !!args.removeAll;
        var removedEffects = [];

        if (removeAll) {
            for (var i = effectsGroup.numProperties; i >= 1; i--) {
                var current = effectsGroup.property(i);
                removedEffects.push({
                    index: current.propertyIndex,
                    name: current.name,
                    matchName: current.matchName
                });
                current.remove();
            }
        } else {
            var effect = resolveEffectOnLayer(resolved.layer, args || {});
            removedEffects.push({
                index: effect.propertyIndex,
                name: effect.name,
                matchName: effect.matchName
            });
            effect.remove();
        }

        return JSON.stringify({
            status: "success",
            message: "Effect removal completed",
            composition: {
                name: resolved.comp.name,
                index: resolved.compIndex
            },
            layer: {
                name: resolved.layer.name,
                index: resolved.layerIndex
            },
            removedCount: removedEffects.length,
            removedEffects: removedEffects
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}


function applyEffectTemplate(args) {
    try {
        
        var compIndex = args.compIndex || 1; 
        var layerIndex = args.layerIndex || 1; 
        var templateName = args.templateName; 
        var customSettings = args.customSettings || {}; 
        
        if (!templateName) {
            throw new Error("You must specify a templateName");
        }
        
        
        var comp = app.project.item(compIndex);
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("Composition not found at index " + compIndex);
        }
        
        
        var layer = comp.layer(layerIndex);
        if (!layer) {
            throw new Error("Layer not found at index " + layerIndex + " in composition '" + comp.name + "'");
        }
        
        
        var templates = {
            
            "gaussian-blur": {
                effectMatchName: "ADBE Gaussian Blur 2",
                settings: {
                    "Blurriness": customSettings.blurriness || 20
                }
            },
            "directional-blur": {
                effectMatchName: "ADBE Directional Blur",
                settings: {
                    "Direction": customSettings.direction || 0,
                    "Blur Length": customSettings.length || 10
                }
            },
            
            
            "color-balance": {
                effectMatchName: "ADBE Color Balance (HLS)",
                settings: {
                    "Hue": customSettings.hue || 0,
                    "Lightness": customSettings.lightness || 0,
                    "Saturation": customSettings.saturation || 0
                }
            },
            "brightness-contrast": {
                effectMatchName: "ADBE Brightness & Contrast 2",
                settings: {
                    "Brightness": customSettings.brightness || 0,
                    "Contrast": customSettings.contrast || 0,
                    "Use Legacy": false
                }
            },
            "curves": {
                effectMatchName: "ADBE CurvesCustom",
                
            },
            
            
            "glow": {
                effectMatchName: "ADBE Glow",
                settings: {
                    "Glow Threshold": customSettings.threshold || 50,
                    "Glow Radius": customSettings.radius || 15,
                    "Glow Intensity": customSettings.intensity || 1
                }
            },
            "drop-shadow": {
                effectMatchName: "ADBE Drop Shadow",
                settings: {
                    "Shadow Color": customSettings.color || [0, 0, 0, 1],
                    "Opacity": customSettings.opacity || 50,
                    "Direction": customSettings.direction || 135,
                    "Distance": customSettings.distance || 10,
                    "Softness": customSettings.softness || 10
                }
            },
            
            
            "cinematic-look": {
                effects: [
                    {
                        effectMatchName: "ADBE CurvesCustom",
                        settings: {}
                    },
                    {
                        effectMatchName: "ADBE Vibrance",
                        settings: {
                            "Vibrance": 15,
                            "Saturation": -5
                        }
                    }
                ]
            },
            "text-pop": {
                effects: [
                    {
                        effectMatchName: "ADBE Drop Shadow",
                        settings: {
                            "Shadow Color": [0, 0, 0, 1],
                            "Opacity": 75,
                            "Distance": 5,
                            "Softness": 10
                        }
                    },
                    {
                        effectMatchName: "ADBE Glow",
                        settings: {
                            "Glow Threshold": 50,
                            "Glow Radius": 10,
                            "Glow Intensity": 1.5
                        }
                    }
                ]
            }
        };
        
        
        var template = templates[templateName];
        if (!template) {
            var templateNames = [];
            for (var templateKey in templates) {
                if (templates.hasOwnProperty(templateKey)) {
                    templateNames.push(templateKey);
                }
            }
            var availableTemplates = templateNames.join(", ");
            throw new Error("Template '" + templateName + "' not found. Available templates: " + availableTemplates);
        }
        
        var appliedEffects = [];
        
        
        if (template.effectMatchName) {
            
            var effect = layer.Effects.addProperty(template.effectMatchName);
            
            
            for (var propName in template.settings) {
                try {
                    var property = effect.property(propName);
                    if (property) {
                        property.setValue(template.settings[propName]);
                    }
                } catch (e) {
                    $.writeln("Warning: Could not set " + propName + " on effect " + effect.name + ": " + e);
                }
            }
            
            appliedEffects.push({
                name: effect.name,
                matchName: effect.matchName
            });
        } else if (template.effects) {
            
            for (var i = 0; i < template.effects.length; i++) {
                var effectData = template.effects[i];
                var effect = layer.Effects.addProperty(effectData.effectMatchName);
                
                
                for (var propName in effectData.settings) {
                    try {
                        var property = effect.property(propName);
                        if (property) {
                            property.setValue(effectData.settings[propName]);
                        }
                    } catch (e) {
                        $.writeln("Warning: Could not set " + propName + " on effect " + effect.name + ": " + e);
                    }
                }
                
                appliedEffects.push({
                    name: effect.name,
                    matchName: effect.matchName
                });
            }
        }
        
        return JSON.stringify({
            status: "success",
            message: "Effect template '" + templateName + "' applied successfully",
            appliedEffects: appliedEffects,
            layer: {
                name: layer.name,
                index: layerIndex
            },
            composition: {
                name: comp.name,
                index: compIndex
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}




function bridgeTestEffects(args) {
    try {
        var compIndex = (args && args.compIndex) ? args.compIndex : 1;
        var layerIndex = (args && args.layerIndex) ? args.layerIndex : 1;

        
        var blurRes = JSON.parse(applyEffect({
            compIndex: compIndex,
            layerIndex: layerIndex,
            effectMatchName: "ADBE Gaussian Blur 2",
            effectSettings: { "Blurriness": 5 }
        }));

        
        var shadowRes = JSON.parse(applyEffectTemplate({
            compIndex: compIndex,
            layerIndex: layerIndex,
            templateName: "drop-shadow"
        }));

        return JSON.stringify({
            status: "success",
            message: "Bridge test effects applied.",
            results: [blurRes, shadowRes]
        }, null, 2);
    } catch (e) {
        return JSON.stringify({ status: "error", message: e.toString() }, null, 2);
    }
}


if (typeof JSON === "undefined") {
    JSON = {};
}
if (typeof JSON.parse !== "function") {
    JSON.parse = function (text) {
        
        return eval("(" + text + ")");
    };
}
if (typeof JSON.stringify !== "function") {
    (function () {
        function esc(str) {
            return (str + "")
                .replace(/\\/g, "\\\\")
                .replace(/"/g, '\\"')
                .replace(/\n/g, "\\n")
                .replace(/\r/g, "\\r")
                .replace(/\t/g, "\\t");
        }
        function toJSON(val) {
            if (val === null) return "null";
            var t = typeof val;
            if (t === "number" || t === "boolean") return String(val);
            if (t === "string") return '"' + esc(val) + '"';
            if (val instanceof Array) {
                var a = [];
                for (var i = 0; i < val.length; i++) a.push(toJSON(val[i]));
                return "[" + a.join(",") + "]";
            }
            if (t === "object") {
                var props = [];
                for (var k in val) {
                    if (val.hasOwnProperty(k) && typeof val[k] !== "function" && typeof val[k] !== "undefined") {
                        props.push('"' + esc(k) + '":' + toJSON(val[k]));
                    }
                }
                return "{" + props.join(",") + "}";
            }
            return "null";
        }
        JSON.stringify = function (value, _replacer, _space) {
            return toJSON(value);
        };
    })();
}
var aeVersion = parseFloat(app.version);
var isAE2025OrLater = aeVersion >= 25.0;
// When launched via Window > mcp-bridge-auto.jsx, AE passes the dockable Panel as
// top-level `this` - reuse it so the UI lives in ONE clean docked panel (no empty
// leftover). Fall back to a floating palette only when run via File > Scripts.
var panel = (this instanceof Panel)
    ? this
    : new Window("palette", "MCP Bridge Auto", undefined, { resizeable: true });
panel.orientation = "column";
panel.alignChildren = ["fill", "top"];
panel.spacing = 10;
panel.margins = 16;
var statusText = panel.add("statictext", undefined, "Waiting for commands...");
statusText.alignment = ["fill", "top"];
var logPanel = panel.add("panel", undefined, "Command Log");
logPanel.orientation = "column";
logPanel.alignChildren = ["fill", "fill"];
var logText = logPanel.add("edittext", undefined, "", {multiline: true, readonly: true});
logText.preferredSize.height = 200;
// (Dockable panels DO work on AE 2025/2026 with the correct ScriptUI pattern below,
// so the old "floating window only" warning was removed.)
var autoRunCheckbox = panel.add("checkbox", undefined, "Auto-run commands");
autoRunCheckbox.value = true;
var checkInterval = 500;
var isChecking = false;
var currentCommandId = "";
// Dedup key for the last command we acted on. We deduplicate by the server-issued
// commandId instead of mutating a "status" field inside the shared command file:
// the Node server also writes that file, so an AE-side read-modify-write would race
// with the next command's write and could silently drop a command (issue: lost
// command under concurrent/rapid tool dispatch). The server matches results purely
// by _commandId, so AE never needs to write the command file at all.
var lastProcessedCommandId = "";
var BRIDGE_VERSION = "1.7.1-mcp-enhanced";
// Pure read-only commands: they never mutate the project, so we skip the undo
// group for them (no empty "MCP: ping" entries cluttering Edit > Undo History).
var READ_ONLY_COMMANDS = {
    "ping": true,
    "getProjectInfo": true,
    "listCompositions": true,
    "getLayerInfo": true,
    "listLayerEffects": true,
    "listAvailableEffects": true,
    "getLayerFull": true,
    "getCompFull": true,
    "getLayerClipFrames": true,
    "getLayerAudioInfo": true
};
// MUST mirror getAETempDir() on the Node server side. On Windows we use
// LOCALAPPDATA (never redirected by OneDrive) so both processes resolve to the
// same folder. Override with the AE_MCP_BRIDGE_DIR env var if needed.
function getBridgeFolder() {
    var basePath = null;
    try {
        if (typeof $ !== "undefined" && $.getenv) {
            var ov = $.getenv("AE_MCP_BRIDGE_DIR");
            if (ov && ("" + ov).length > 0) { basePath = "" + ov; }
        }
    } catch (eo) {}
    if (!basePath) {
        // Prefer LOCALAPPDATA whenever it is set, independent of $.os detection
        // (LOCALAPPDATA is a Windows-only variable, so this matches the Node side's
        // "win32 -> LOCALAPPDATA" exactly and avoids a Documents/OneDrive mismatch
        // if $.os reporting ever fails).
        var lad = null;
        try { lad = $.getenv("LOCALAPPDATA"); } catch (el) {}
        if (lad && ("" + lad).length > 0) {
            basePath = ("" + lad) + "/ae-mcp-bridge";
        }
    }
    if (!basePath) {
        // macOS / no LOCALAPPDATA: mirror the Node side's Documents fallback.
        basePath = Folder.myDocuments.fsName + "/ae-mcp-bridge";
    }
    var bridgeFolder = new Folder(basePath);
    if (!bridgeFolder.exists) { bridgeFolder.create(); }
    return bridgeFolder;
}
function getCommandFilePath() {
    return getBridgeFolder().fsName + "/ae_command.json";
}
function getResultFilePath() {
    return getBridgeFolder().fsName + "/ae_mcp_result.json";
}
function getProjectInfo() {
    var project = app.project;
    var result = {
        projectName: project.file ? project.file.name : "Untitled Project",
        path: project.file ? project.file.fsName : "",
        numItems: project.numItems,
        bitsPerChannel: project.bitsPerChannel,
        timeMode: project.timeDisplayType === TimeDisplayType.FRAMES ? "Frames" : "Timecode",
        items: []
    };
    var countByType = {
        compositions: 0,
        footage: 0,
        folders: 0,
        solids: 0
    };
    for (var i = 1; i <= Math.min(project.numItems, 50); i++) {
        var item = project.item(i);
        var itemType = "";
        
        if (item instanceof CompItem) {
            itemType = "Composition";
            countByType.compositions++;
        } else if (item instanceof FolderItem) {
            itemType = "Folder";
            countByType.folders++;
        } else if (item instanceof FootageItem) {
            if (item.mainSource instanceof SolidSource) {
                itemType = "Solid";
                countByType.solids++;
            } else {
                itemType = "Footage";
                countByType.footage++;
            }
        }
        
        result.items.push({
            id: item.id,
            name: item.name,
            type: itemType
        });
    }
    
    result.itemCounts = countByType;
    if (app.project.activeItem instanceof CompItem) {
        var ac = app.project.activeItem;
        result.activeComp = {
            id: ac.id,
            name: ac.name,
            width: ac.width,
            height: ac.height,
            duration: ac.duration,
            frameRate: ac.frameRate,
            numLayers: ac.numLayers
        };
    }

    return JSON.stringify(result, null, 2);
}

function listCompositions() {
    var project = app.project;
    var result = {
        compositions: []
    };
    for (var i = 1; i <= project.numItems; i++) {
        var item = project.item(i);
        if (item instanceof CompItem) {
            result.compositions.push({
                id: item.id,
                name: item.name,
                duration: item.duration,
                frameRate: item.frameRate,
                width: item.width,
                height: item.height,
                numLayers: item.numLayers
            });
        }
    }
    
    return JSON.stringify(result, null, 2);
}

function getLayerInfo() {
    var project = app.project;
    var result = {
        layers: []
    };
    var activeComp = null;
    if (app.project.activeItem instanceof CompItem) {
        activeComp = app.project.activeItem;
    } else {
        return JSON.stringify({ error: "No active composition" }, null, 2);
    }
    for (var i = 1; i <= activeComp.numLayers; i++) {
        var layer = activeComp.layer(i);
        var layerInfo = {
            index: layer.index,
            name: layer.name,
            enabled: layer.enabled,
            locked: layer.locked,
            inPoint: layer.inPoint,
            outPoint: layer.outPoint
        };
        
        result.layers.push(layerInfo);
    }
    
    return JSON.stringify(result, null, 2);
}
// ---------------------------------------------------------------------------
// MCP enhancements: generic ExtendScript execution + render queue automation
// ---------------------------------------------------------------------------

// Resolve a composition by name (preferred), 1-based index among comps, or active item.
function _resolveComp(args) {
    var comp = null;
    if (args && args.compName) {
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && it.name === args.compName) { comp = it; break; }
        }
    }
    if (!comp && args && args.compIndex) {
        var c = 0;
        for (var j = 1; j <= app.project.numItems; j++) {
            var itm = app.project.item(j);
            if (itm instanceof CompItem) {
                c++;
                if (c === args.compIndex) { comp = itm; break; }
            }
        }
    }
    if (!comp && app.project.activeItem instanceof CompItem) {
        comp = app.project.activeItem;
    }
    return comp;
}

// --- Layer management (ported & adapted from Dakkshin/after-effects-mcp) -------

// Resolve a layer within a comp by 1-based index or by name.
function _resolveLayer(comp, a) {
    var layer = null;
    if (a.layerIndex !== undefined && a.layerIndex !== null) {
        if (a.layerIndex > 0 && a.layerIndex <= comp.numLayers) layer = comp.layer(a.layerIndex);
    } else if (a.layerName) {
        for (var j = 1; j <= comp.numLayers; j++) { if (comp.layer(j).name === a.layerName) { layer = comp.layer(j); break; } }
    }
    return layer;
}

// Get a child property by matchName (locale-independent), falling back to a
// localized display name. Makes these handlers work on non-English After Effects.
function _safeProp(parent, matchName, displayName) {
    if (!parent) return null;
    var p = null;
    try { p = parent.property(matchName); } catch (e) { p = null; }
    if (!p && displayName) { try { p = parent.property(displayName); } catch (e2) { p = null; } }
    return p;
}

// --- Arabic / RTL text support ------------------------------------------------
// Detect Arabic (and Arabic presentation forms) anywhere in the string.
function _hasArabic(s) {
    if (s === undefined || s === null) return false;
    return /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test("" + s);
}

// Apply text direction to a TextDocument. direction: "rtl" | "ltr" | "auto" (default
// "auto" = RTL when the text contains Arabic). Returns true if RTL was applied.
// Wrapped in try/catch because TextDirection exists only on AE 17.0+ (2020) and
// requires the ME/South-Asian text engine for full Arabic shaping.
function _applyTextDirection(td, text, directionArg) {
    var wantRtl;
    if (directionArg === "rtl") wantRtl = true;
    else if (directionArg === "ltr") wantRtl = false;
    else wantRtl = _hasArabic(text);
    if (wantRtl) {
        try { td.direction = TextDirection.DIRECTION_RIGHT_TO_LEFT; } catch (eDir) {}
    } else if (directionArg === "ltr") {
        try { td.direction = TextDirection.DIRECTION_LEFT_TO_RIGHT; } catch (eDir2) {}
    }
    return wantRtl;
}

function createCamera(args) {
    try {
        var comp = _resolveComp(args);
        if (!comp) return JSON.stringify({ status: "error", message: "No composition found. Provide compName or compIndex, or open a comp." });

        var name = args.name || "Camera";
        var zoom = args.zoom || 1777.78;
        var position = args.position;
        var pointOfInterest = args.pointOfInterest;
        var oneNode = args.oneNode || false;

        var centerPoint = [comp.width / 2, comp.height / 2];
        var cameraLayer = comp.layers.addCamera(name, centerPoint);

        var zoomProp = _safeProp(_safeProp(cameraLayer, "ADBE Camera Options Group", "Camera Options"), "ADBE Camera Zoom", "Zoom");
        if (zoomProp) { zoomProp.setValue(zoom); }
        if (oneNode) { cameraLayer.autoOrient = AutoOrientType.NO_AUTO_ORIENT; }
        var posProp = _safeProp(cameraLayer, "ADBE Position", "Position");
        if (position !== undefined && position !== null && posProp) { posProp.setValue(position); }
        var poiProp = _safeProp(cameraLayer, "ADBE Point of Interest", "Point of Interest");
        if (pointOfInterest !== undefined && pointOfInterest !== null && !oneNode && poiProp) { poiProp.setValue(pointOfInterest); }

        var info = { name: cameraLayer.name, index: cameraLayer.index, oneNode: oneNode };
        try { if (zoomProp) info.zoom = zoomProp.value; } catch (e) {}
        try { if (posProp) info.position = posProp.value; } catch (e) {}
        try { if (!oneNode && poiProp) info.pointOfInterest = poiProp.value; } catch (e) {}
        return JSON.stringify({ status: "success", message: "Camera created successfully", layer: info }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function duplicateLayer(args) {
    try {
        var comp = _resolveComp(args);
        if (!comp) return JSON.stringify({ status: "error", message: "No composition found." });
        var layer = _resolveLayer(comp, args);
        if (!layer) return JSON.stringify({ status: "error", message: "Layer not found. Provide layerIndex or layerName." });
        var newLayer = layer.duplicate();
        if (args.newName) { newLayer.name = args.newName; }
        return JSON.stringify({ status: "success", message: "Layer duplicated successfully", original: { name: layer.name, index: layer.index }, duplicate: { name: newLayer.name, index: newLayer.index } }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function deleteLayer(args) {
    try {
        var comp = _resolveComp(args);
        if (!comp) return JSON.stringify({ status: "error", message: "No composition found." });
        var layer = _resolveLayer(comp, args);
        if (!layer) return JSON.stringify({ status: "error", message: "Layer not found. Provide layerIndex or layerName." });
        var deletedName = layer.name, deletedIndex = layer.index;
        layer.remove();
        return JSON.stringify({ status: "success", message: "Layer deleted successfully", deleted: { name: deletedName, index: deletedIndex } }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function setLayerMask(args) {
    try {
        var comp = _resolveComp(args);
        if (!comp) return JSON.stringify({ status: "error", message: "No composition found." });
        var layer = _resolveLayer(comp, args);
        if (!layer) return JSON.stringify({ status: "error", message: "Layer not found. Provide layerIndex or layerName." });

        var maskIndex = args.maskIndex;
        var maskPath = args.maskPath;
        var maskRect = args.maskRect;
        var maskMode = args.maskMode || "add";

        var shapePoints = [];
        if (maskRect) {
            var t = maskRect.top || 0, l = maskRect.left || 0, w = maskRect.width || comp.width, h = maskRect.height || comp.height;
            shapePoints = [[l, t], [l + w, t], [l + w, t + h], [l, t + h]];
        } else if (maskPath && maskPath.length >= 3) {
            shapePoints = maskPath;
        } else {
            throw new Error("Must provide either maskRect or maskPath with at least 3 points");
        }

        var myShape = new Shape();
        myShape.vertices = shapePoints;
        myShape.closed = true;

        var masksGroup = _safeProp(layer, "ADBE Mask Parade", "Masks");
        if (!masksGroup) { throw new Error("This layer type cannot have masks."); }

        var changed = [];
        var mask;
        if (maskIndex !== undefined && maskIndex !== null) {
            if (maskIndex > 0 && maskIndex <= masksGroup.numProperties) { mask = masksGroup.property(maskIndex); }
            else { throw new Error("Mask index out of bounds: " + maskIndex); }
            changed.push("maskPath");
        } else {
            try { mask = masksGroup.addProperty("ADBE Mask Atom"); } catch (eAdd) { mask = masksGroup.addProperty("Mask"); }
            changed.push("newMask");
        }
        var pathProp = _safeProp(mask, "ADBE Mask Shape", "Mask Path");
        if (pathProp) { pathProp.setValue(myShape); }

        var modes = { "none": MaskMode.NONE, "add": MaskMode.ADD, "subtract": MaskMode.SUBTRACT, "intersect": MaskMode.INTERSECT, "lighten": MaskMode.LIGHTEN, "darken": MaskMode.DARKEN, "difference": MaskMode.DIFFERENCE };
        if (modes[maskMode] !== undefined) { mask.maskMode = modes[maskMode]; changed.push("maskMode"); }
        if (args.maskFeather !== undefined && args.maskFeather !== null) { var fp = _safeProp(mask, "ADBE Mask Feather", "Mask Feather"); if (fp) { fp.setValue(args.maskFeather); changed.push("maskFeather"); } }
        if (args.maskOpacity !== undefined && args.maskOpacity !== null) { var mop = _safeProp(mask, "ADBE Mask Opacity", "Mask Opacity"); if (mop) { mop.setValue(args.maskOpacity); changed.push("maskOpacity"); } }
        if (args.maskExpansion !== undefined && args.maskExpansion !== null) { var mep = _safeProp(mask, "ADBE Mask Offset", "Mask Expansion"); if (mep) { mep.setValue(args.maskExpansion); changed.push("maskExpansion"); } }
        if (args.maskName) { mask.name = args.maskName; changed.push("maskName"); }

        return JSON.stringify({ status: "success", message: "Mask set successfully", layer: { name: layer.name, index: layer.index }, mask: { name: mask.name, index: mask.propertyIndex, mode: maskMode, changedProperties: changed } }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function batchSetLayerProperties(args) {
    try {
        var comp = _resolveComp(args);
        if (!comp) return JSON.stringify({ status: "error", message: "No composition found." });
        var operations = args.operations;
        if (!operations || !operations.length) { throw new Error("No operations provided. Pass an array of {layerIndex, ...properties}"); }

        var results = [];
        for (var o = 0; o < operations.length; o++) {
            var op = operations[o];
            var layer = _resolveLayer(comp, op);
            if (!layer) { results.push({ layerIndex: op.layerIndex, layerName: op.layerName, status: "error", message: "Layer not found" }); continue; }

            var changed = [];
            if (op.threeDLayer !== undefined && op.threeDLayer !== null) { layer.threeDLayer = !!op.threeDLayer; changed.push("threeDLayer"); }
            if (op.position !== undefined && op.position !== null) {
                var posProp = _safeProp(layer, "ADBE Position", "Position");
                if (posProp) { while (posProp.numKeys > 0) { posProp.removeKey(1); } posProp.setValue(op.position); changed.push("position"); }
            }
            if (op.scale !== undefined && op.scale !== null) { var scProp = _safeProp(layer, "ADBE Scale", "Scale"); if (scProp) { scProp.setValue(op.scale); changed.push("scale"); } }
            if (op.rotation !== undefined && op.rotation !== null) {
                var rotProp = _safeProp(layer, "ADBE Rotate Z", layer.threeDLayer ? "Z Rotation" : "Rotation");
                if (rotProp) { rotProp.setValue(op.rotation); changed.push("rotation"); }
            }
            if (op.opacity !== undefined && op.opacity !== null) { var opProp = _safeProp(layer, "ADBE Opacity", "Opacity"); if (opProp) { opProp.setValue(op.opacity); changed.push("opacity"); } }
            if (op.blendMode !== undefined && op.blendMode !== null) {
                var bModes = { "normal": BlendingMode.NORMAL, "add": BlendingMode.ADD, "multiply": BlendingMode.MULTIPLY, "screen": BlendingMode.SCREEN, "overlay": BlendingMode.OVERLAY, "softLight": BlendingMode.SOFT_LIGHT, "hardLight": BlendingMode.HARD_LIGHT, "darken": BlendingMode.DARKEN, "lighten": BlendingMode.LIGHTEN, "difference": BlendingMode.DIFFERENCE };
                if (bModes[op.blendMode] !== undefined) { layer.blendingMode = bModes[op.blendMode]; changed.push("blendMode"); }
            }
            if (op.startTime !== undefined && op.startTime !== null) { layer.startTime = op.startTime; changed.push("startTime"); }
            if (op.outPoint !== undefined && op.outPoint !== null) { layer.outPoint = op.outPoint; changed.push("outPoint"); }

            var posReadProp = _safeProp(layer, "ADBE Position", "Position");
            results.push({ layerIndex: layer.index, name: layer.name, status: "success", threeDLayer: layer.threeDLayer, position: posReadProp ? posReadProp.value : null, changedProperties: changed });
        }
        return JSON.stringify({ status: "success", results: results }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function setCompositionProperties(args) {
    try {
        var comp = _resolveComp(args);
        if (!comp) return JSON.stringify({ status: "error", message: "No composition found." });
        var changed = [];
        if (args.duration !== undefined && args.duration !== null) { comp.duration = args.duration; changed.push("duration"); }
        if (args.frameRate !== undefined && args.frameRate !== null) { comp.frameRate = args.frameRate; changed.push("frameRate"); }
        if (args.width !== undefined && args.width !== null && args.height !== undefined && args.height !== null) { comp.width = args.width; comp.height = args.height; changed.push("dimensions"); }
        return JSON.stringify({ status: "success", composition: { name: comp.name, duration: comp.duration, frameRate: comp.frameRate, width: comp.width, height: comp.height }, changedProperties: changed }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// Resolve an AE enum value to its name (e.g. BlendingMode -> "NORMAL").
function enumName(enumObj, val) {
    try { for (var k in enumObj) { if (enumObj[k] === val) return k; } } catch (e) {}
    return String(val);
}

// Coerce a property value to something JSON-serializable.
function safeValue(v) {
    try {
        if (v === null || v === undefined) return null;
        if (v instanceof Array) return v;
        var t = typeof v;
        if (t === "number" || t === "string" || t === "boolean") return v;
        return "[object]"; // Shape / TextDocument / MarkerValue etc. are not serializable
    } catch (e) { return null; }
}

// Dump a single (leaf) property: value, expression, and keyframe summary.
function dumpLeaf(prop, includeKeyframes, maxKeyframes) {
    var o = { name: prop.name };
    try { o.matchName = prop.matchName; } catch (e) {}
    try { o.value = safeValue(prop.value); } catch (e) { o.value = null; }
    try { o.expression = (prop.canSetExpression && prop.expressionEnabled) ? prop.expression : null; } catch (e) { o.expression = null; }
    try {
        o.numKeys = prop.numKeys;
        if (includeKeyframes && prop.numKeys > 0) {
            o.keys = [];
            var lim = Math.min(prop.numKeys, maxKeyframes || 50);
            for (var k = 1; k <= lim; k++) {
                var key = { time: prop.keyTime(k), value: safeValue(prop.keyValue(k)) };
                try { key.inInterp = enumName(KeyframeInterpolationType, prop.keyInInterpolationType(k)); } catch (e) {}
                try { key.outInterp = enumName(KeyframeInterpolationType, prop.keyOutInterpolationType(k)); } catch (e) {}
                o.keys.push(key);
            }
        }
    } catch (e) {}
    return o;
}

function _layerTypeName(layer) {
    if (layer instanceof TextLayer) return "TextLayer";
    if (layer instanceof ShapeLayer) return "ShapeLayer";
    if (layer instanceof CameraLayer) return "CameraLayer";
    if (layer instanceof LightLayer) return "LightLayer";
    if (layer instanceof AVLayer) return "AVLayer";
    return "Layer";
}

// Comp-level map: the full layer tree with a useful summary per layer. Use this to
// navigate a composition, then inspect-layer for one layer's full detail.
function getCompFull(args) {
    try {
        var comp = _resolveComp(args);
        if (!comp) return JSON.stringify({ status: "error", error: "Composition not found. Provide compName or compIndex, or open a comp." });

        var c = {
            id: comp.id, name: comp.name, width: comp.width, height: comp.height,
            duration: comp.duration, frameRate: comp.frameRate, numLayers: comp.numLayers
        };
        try { c.pixelAspect = comp.pixelAspect; } catch (e) {}
        try { c.workAreaStart = comp.workAreaStart; c.workAreaDuration = comp.workAreaDuration; } catch (e) {}
        try { c.bgColor = comp.bgColor; } catch (e) {}

        var layers = [];
        for (var i = 1; i <= comp.numLayers; i++) {
            var l = comp.layer(i);
            var lo = { index: l.index, name: l.name };
            try { lo.id = l.id; } catch (e) {}
            try { lo.type = _layerTypeName(l); } catch (e) {}
            try { lo.enabled = l.enabled; } catch (e) {}
            try { lo.locked = l.locked; } catch (e) {}
            try { lo.shy = l.shy; } catch (e) {}
            try { lo.solo = l.solo; } catch (e) {}
            try { lo.threeDLayer = l.threeDLayer; } catch (e) {}
            try { lo.adjustmentLayer = l.adjustmentLayer; } catch (e) {}
            try { lo.nullLayer = l.nullLayer; } catch (e) {}
            try { lo.inPoint = l.inPoint; lo.outPoint = l.outPoint; lo.startTime = l.startTime; } catch (e) {}
            try { lo.label = l.label; } catch (e) {}
            try { lo.parent = l.parent ? l.parent.name : null; lo.parentIndex = l.parent ? l.parent.index : null; } catch (e) {}
            try { lo.blendingMode = enumName(BlendingMode, l.blendingMode); } catch (e) {}
            try { var fx = l.property("ADBE Effect Parade"); lo.numEffects = fx ? fx.numProperties : 0; } catch (e) { lo.numEffects = 0; }
            try { var mp = l.property("ADBE Mask Parade"); lo.numMasks = mp ? mp.numProperties : 0; } catch (e) { lo.numMasks = 0; }
            try { lo.hasAudio = (l instanceof AVLayer) ? l.hasAudio : false; } catch (e) {}
            try { lo.comment = l.comment; } catch (e) {}
            layers.push(lo);
        }

        return JSON.stringify({ status: "success", comp: c, layers: layers }, null, 2);
    } catch (e) {
        return JSON.stringify({ status: "error", error: e.toString(), line: (e.line !== undefined ? e.line : null) }, null, 2);
    }
}

// Monotonic counter for unique scratch PNG names (bridge is serial, but this
// avoids any collision with a leftover from a previously crashed call).
var _seeFrameSeq = 0;

// Remove any leftover "__mcp_tmp__" comps from a previous crashed seeFrame call
// so the user's project is never polluted with our temporaries.
function _sweepMcpTempComps() {
    try {
        for (var i = app.project.numItems; i >= 1; i--) {
            var it = app.project.item(i);
            if (it instanceof CompItem && it.name.indexOf("__mcp_tmp__") === 0) {
                try { it.remove(); } catch (e) {}
            }
        }
    } catch (e) {}
}

// Import a file, retrying briefly. saveFrameToPng writes a PNG synchronously, but
// on Windows the OS write-lock/flush can lag, so an immediate importFile fails
// with "File exists but couldn't be open for reading". A short retry loop lets the
// lock release. Only used for PNGs we just wrote (contact-sheet / match-reference).
function _importWithRetry(file) {
    var lastErr = null;
    for (var attempt = 0; attempt < 10; attempt++) {
        try {
            return app.project.importFile(new ImportOptions(file));
        } catch (e) {
            lastErr = e;
            $.sleep(150);
        }
    }
    throw lastErr;
}

// see-frame: render one or more frames of a comp to PNG and return their paths so
// the Node side can hand the actual pixels back to the model. Renders a downscaled
// nested comp when maxWidth < comp.width, so AE performs the downscale before any
// pixels leave the app.
function seeFrame(args) {
    var tempComp = null;
    try {
        _sweepMcpTempComps();

        var comp = _resolveComp(args);
        if (!comp) {
            return JSON.stringify({ status: "error", error: "Composition not found. Provide compName or compIndex, or open a comp." });
        }

        var dur = comp.duration;
        // Build the list of capture times (clamp into [0, duration]).
        var times = [];
        if (args && args.times && args.times.length) {
            for (var t = 0; t < args.times.length; t++) {
                var tv = args.times[t];
                if (typeof tv === "number" && !isNaN(tv)) {
                    if (tv < 0) tv = 0;
                    if (tv > dur) tv = dur;
                    times.push(tv);
                }
            }
        }
        if (!times.length) times = [dur / 2];

        var maxWidth = (args && typeof args.maxWidth === "number") ? args.maxWidth : 512;
        var motionBlur = !!(args && args.motionBlur);

        // Pick the render target: the comp itself, or a temp downscale comp nesting it.
        var target = comp;
        if (maxWidth > 0 && maxWidth < comp.width) {
            var tw = Math.round(maxWidth / 2) * 2; if (tw < 2) tw = 2;
            var th = Math.round((comp.height * tw / comp.width) / 2) * 2; if (th < 2) th = 2;
            tempComp = app.project.items.addComp("__mcp_tmp__seeframe", tw, th, 1, comp.duration, comp.frameRate);
            var nested = tempComp.layers.add(comp);
            var scalePct = (tw / comp.width) * 100;
            try { nested.property("ADBE Transform Group").property("ADBE Scale").setValue([scalePct, scalePct]); } catch (e) {}
            try { nested.property("ADBE Transform Group").property("ADBE Position").setValue([tw / 2, th / 2]); } catch (e) {}
            try { nested.collapseTransformation = true; } catch (e) {}
            target = tempComp;
        }
        try { target.motionBlur = motionBlur; } catch (e) {}

        var folder = getBridgeFolder().fsName;
        var frames = [];
        var note = null;
        for (var i = 0; i < times.length; i++) {
            _seeFrameSeq++;
            var path = folder + "/__mcp_seeframe_" + _seeFrameSeq + "_" + i + ".png";
            try {
                target.saveFrameToPng(times[i], new File(path));
                frames.push({ time: times[i], path: path, w: target.width, h: target.height });
            } catch (fe) {
                note = (note ? note + " " : "") + "Frame at t=" + times[i] + "s failed: " + fe.toString();
            }
        }

        var out = { status: "success", compName: comp.name, frames: frames };
        if (note) out.note = note;
        if (args && args.includeState) {
            try { out.state = getCompFull({ compName: comp.name }); } catch (se) {}
        }
        if (!frames.length) { out.status = "error"; out.error = note || "No frames could be rendered."; }
        return JSON.stringify(out);
    } catch (e) {
        return JSON.stringify({ status: "error", error: e.toString(), line: (e.line !== undefined ? e.line : null) });
    } finally {
        if (tempComp) { try { tempComp.remove(); } catch (ce) {} }
    }
}

// contact-sheet: render N frames sampled across the comp and let AE itself
// composite them into ONE labeled thumbnail grid. Every temp comp / imported
// footage / scratch PNG is tracked and removed, so the user's project is never
// polluted.
function contactSheet(args) {
    var gridComp = null;
    var importedItems = [];
    var scratch = [];
    try {
        _sweepMcpTempComps();
        var comp = _resolveComp(args);
        if (!comp) return JSON.stringify({ status: "error", error: "Composition not found." });

        var count = (args && typeof args.count === "number") ? Math.round(args.count) : 9;
        if (count < 1) count = 1; if (count > 64) count = 64;
        var sheetW = (args && typeof args.maxWidth === "number") ? args.maxWidth : 1024;
        if (sheetW < 64) sheetW = 64;

        var folder = getBridgeFolder().fsName;
        var dur = comp.duration;

        // near-square grid
        var cols = Math.ceil(Math.sqrt(count));
        var rows = Math.ceil(count / cols);

        var cellW = Math.round((sheetW / cols) / 2) * 2; if (cellW < 2) cellW = 2;
        var cellH = Math.round((cellW * comp.height / comp.width) / 2) * 2; if (cellH < 2) cellH = 2;
        var gw = cellW * cols;
        var gh = cellH * rows;

        gridComp = app.project.items.addComp("__mcp_tmp__contact", gw, gh, 1, 1, comp.frameRate);

        for (var i = 0; i < count; i++) {
            _seeFrameSeq++;
            var t = (dur * (i + 0.5)) / count;
            var pngPath = folder + "/__mcp_cs_" + _seeFrameSeq + "_" + i + ".png";
            comp.saveFrameToPng(t, new File(pngPath));
            scratch.push(pngPath);

            var foot = _importWithRetry(new File(pngPath));
            importedItems.push(foot);

            var lyr = gridComp.layers.add(foot);
            var col = i % cols;
            var row = Math.floor(i / cols);
            var sx = (cellW / comp.width) * 100;
            lyr.property("ADBE Transform Group").property("ADBE Scale").setValue([sx, sx]);
            lyr.property("ADBE Transform Group").property("ADBE Position").setValue([col * cellW + cellW / 2, row * cellH + cellH / 2]);

            // tiny timecode label in the cell corner
            try {
                var tl = gridComp.layers.addText((Math.round(t * 100) / 100) + "s");
                var td = tl.property("ADBE Text Properties").property("ADBE Text Document").value;
                td.fontSize = Math.max(10, Math.round(cellH * 0.12));
                td.fillColor = [1, 1, 1];
                tl.property("ADBE Text Properties").property("ADBE Text Document").setValue(td);
                tl.property("ADBE Transform Group").property("ADBE Position").setValue([col * cellW + 6, row * cellH + cellH - 6]);
            } catch (te) {}
        }

        _seeFrameSeq++;
        var outPath = folder + "/__mcp_cs_grid_" + _seeFrameSeq + ".png";
        gridComp.saveFrameToPng(0, new File(outPath));

        return JSON.stringify({ status: "success", compName: comp.name, path: outPath, count: count });
    } catch (e) {
        return JSON.stringify({ status: "error", error: e.toString(), line: (e.line !== undefined ? e.line : null) });
    } finally {
        if (gridComp) { try { gridComp.remove(); } catch (ge) {} }
        for (var k = 0; k < importedItems.length; k++) { try { importedItems[k].remove(); } catch (ie) {} }
        for (var s = 0; s < scratch.length; s++) { try { var f = new File(scratch[s]); if (f.exists) f.remove(); } catch (se) {} }
    }
}

// match-reference: import an on-disk reference image, render the current comp
// frame, and use AE's DIFFERENCE blend mode as a dependency-free diff engine.
// Returns a side-by-side PNG and a difference-map PNG.
function matchReference(args) {
    var sbsComp = null, diffComp = null;
    var importedItems = [];
    var scratch = [];
    try {
        _sweepMcpTempComps();
        var comp = _resolveComp(args);
        if (!comp) return JSON.stringify({ status: "error", error: "Composition not found." });
        if (!args || !args.referencePath) return JSON.stringify({ status: "error", error: "referencePath is required." });

        var refFile = new File(args.referencePath);
        if (!refFile.exists) return JSON.stringify({ status: "error", error: "Reference image not found: " + args.referencePath });

        var folder = getBridgeFolder().fsName;
        var t = (typeof args.time === "number") ? args.time : comp.duration / 2;
        if (t < 0) t = 0; if (t > comp.duration) t = comp.duration;

        // Render the current comp frame and import it + the reference as footage.
        _seeFrameSeq++;
        var curPath = folder + "/__mcp_mr_cur_" + _seeFrameSeq + ".png";
        comp.saveFrameToPng(t, new File(curPath));
        scratch.push(curPath);

        var refFoot = _importWithRetry(refFile);
        importedItems.push(refFoot);
        var curFoot = _importWithRetry(new File(curPath));
        importedItems.push(curFoot);

        var rw = refFoot.width, rh = refFoot.height;

        // (1) side-by-side (reference | current), each scaled into half width.
        sbsComp = app.project.items.addComp("__mcp_tmp__sbs", rw * 2, rh, 1, 1, comp.frameRate);
        var rL = sbsComp.layers.add(refFoot);
        rL.property("ADBE Transform Group").property("ADBE Position").setValue([rw / 2, rh / 2]);
        var cR = sbsComp.layers.add(curFoot);
        var csx = (rw / curFoot.width) * 100, csy = (rh / curFoot.height) * 100;
        cR.property("ADBE Transform Group").property("ADBE Scale").setValue([csx, csy]);
        cR.property("ADBE Transform Group").property("ADBE Position").setValue([rw + rw / 2, rh / 2]);
        _seeFrameSeq++;
        var sbsPath = folder + "/__mcp_mr_sbs_" + _seeFrameSeq + ".png";
        sbsComp.saveFrameToPng(0, new File(sbsPath));

        // (2) difference map: current over reference at reference size, DIFFERENCE blend.
        diffComp = app.project.items.addComp("__mcp_tmp__diff", rw, rh, 1, 1, comp.frameRate);
        var dRef = diffComp.layers.add(refFoot);
        dRef.property("ADBE Transform Group").property("ADBE Position").setValue([rw / 2, rh / 2]);
        var dCur = diffComp.layers.add(curFoot);
        var dsx = (rw / curFoot.width) * 100, dsy = (rh / curFoot.height) * 100;
        dCur.property("ADBE Transform Group").property("ADBE Scale").setValue([dsx, dsy]);
        dCur.property("ADBE Transform Group").property("ADBE Position").setValue([rw / 2, rh / 2]);
        try { dCur.blendingMode = BlendingMode.DIFFERENCE; } catch (be) {}
        _seeFrameSeq++;
        var diffPath = folder + "/__mcp_mr_diff_" + _seeFrameSeq + ".png";
        diffComp.saveFrameToPng(0, new File(diffPath));

        return JSON.stringify({ status: "success", compName: comp.name, sideBySidePath: sbsPath, diffPath: diffPath });
    } catch (e) {
        return JSON.stringify({ status: "error", error: e.toString(), line: (e.line !== undefined ? e.line : null) });
    } finally {
        if (sbsComp) { try { sbsComp.remove(); } catch (e1) {} }
        if (diffComp) { try { diffComp.remove(); } catch (e2) {} }
        for (var k = 0; k < importedItems.length; k++) { try { importedItems[k].remove(); } catch (ie) {} }
        for (var s = 0; s < scratch.length; s++) { try { var f = new File(scratch[s]); if (f.exists) f.remove(); } catch (se) {} }
    }
}

// Deep inspector: everything you need to SEE before precisely editing a layer.
function getLayerFull(args) {
    try {
        var comp = _resolveComp(args);
        if (!comp) return JSON.stringify({ status: "error", error: "Composition not found." });

        var layer = null;
        if (args.layerName) {
            for (var i = 1; i <= comp.numLayers; i++) {
                if (comp.layer(i).name === args.layerName) { layer = comp.layer(i); break; }
            }
        }
        if (!layer && args.layerIndex && args.layerIndex >= 1 && args.layerIndex <= comp.numLayers) {
            layer = comp.layer(args.layerIndex);
        }
        if (!layer) return JSON.stringify({ status: "error", error: "Layer not found. Provide layerIndex or layerName." });

        var includeKeyframes = (args.includeKeyframes !== false);
        var maxKeyframes = args.maxKeyframes || 50;

        var info = { index: layer.index, name: layer.name, enabled: layer.enabled, locked: layer.locked };
        try { info.shy = layer.shy; } catch (e) {}
        try { info.solo = layer.solo; } catch (e) {}
        try { info.inPoint = layer.inPoint; info.outPoint = layer.outPoint; info.startTime = layer.startTime; } catch (e) {}
        try { info.stretch = layer.stretch; } catch (e) {}
        try { info.label = layer.label; } catch (e) {}
        try { info.comment = layer.comment; } catch (e) {}
        try { info.threeDLayer = layer.threeDLayer; } catch (e) {}
        try { info.adjustmentLayer = layer.adjustmentLayer; } catch (e) {}
        try { info.nullLayer = layer.nullLayer; } catch (e) {}
        try { info.parent = layer.parent ? layer.parent.name : null; } catch (e) {}
        try { info.blendingMode = enumName(BlendingMode, layer.blendingMode); } catch (e) {}

        var type = "Layer";
        if (layer instanceof TextLayer) type = "TextLayer";
        else if (layer instanceof ShapeLayer) type = "ShapeLayer";
        else if (layer instanceof CameraLayer) type = "CameraLayer";
        else if (layer instanceof LightLayer) type = "LightLayer";
        else if (layer instanceof AVLayer) type = "AVLayer";
        info.type = type;

        try {
            if (layer instanceof AVLayer && layer.source) {
                var src = { name: layer.source.name };
                try { if (layer.source.mainSource && layer.source.mainSource.file) src.file = layer.source.mainSource.file.fsName; } catch (e) {}
                try { src.width = layer.source.width; src.height = layer.source.height; } catch (e) {}
                try { src.duration = layer.source.duration; } catch (e) {}
                info.source = src;
            } else { info.source = null; }
        } catch (e) { info.source = null; }

        info.transform = {};
        try {
            var tg = layer.property("ADBE Transform Group");
            if (tg) {
                for (var t = 1; t <= tg.numProperties; t++) {
                    var tp = tg.property(t);
                    try { if (tp && tp.propertyType === PropertyType.PROPERTY) info.transform[tp.name] = dumpLeaf(tp, includeKeyframes, maxKeyframes); } catch (e) {}
                }
            }
        } catch (e) {}

        info.text = null;
        try {
            if (layer instanceof TextLayer) {
                var td = layer.property("ADBE Text Properties").property("ADBE Text Document").value;
                info.text = {};
                try { info.text.text = td.text; } catch (e) {}
                try { info.text.font = td.font; } catch (e) {}
                try { info.text.fontSize = td.fontSize; } catch (e) {}
                try { info.text.fillColor = td.applyFill ? td.fillColor : null; } catch (e) {}
                try { info.text.justification = enumName(ParagraphJustification, td.justification); } catch (e) {}
            }
        } catch (e) {}

        info.effects = [];
        try {
            var fx = layer.property("ADBE Effect Parade");
            if (fx) {
                for (var e2 = 1; e2 <= fx.numProperties; e2++) {
                    var ef = fx.property(e2);
                    var efo = { index: e2, name: ef.name };
                    try { efo.matchName = ef.matchName; } catch (e) {}
                    try { efo.enabled = ef.enabled; } catch (e) {}
                    efo.properties = {};
                    try {
                        for (var pp = 1; pp <= ef.numProperties; pp++) {
                            var prp = ef.property(pp);
                            try { if (prp && prp.propertyType === PropertyType.PROPERTY) efo.properties[prp.name] = safeValue(prp.value); } catch (e) {}
                        }
                    } catch (e) {}
                    info.effects.push(efo);
                }
            }
        } catch (e) {}

        info.masks = [];
        try {
            var mp = layer.property("ADBE Mask Parade");
            if (mp) {
                for (var m = 1; m <= mp.numProperties; m++) {
                    var mk = mp.property(m);
                    var mko = { name: mk.name };
                    try { mko.mode = enumName(MaskMode, mk.maskMode); } catch (e) {}
                    try { mko.inverted = mk.inverted; } catch (e) {}
                    try { mko.opacity = mk.property("ADBE Mask Opacity").value; } catch (e) {}
                    try { mko.feather = safeValue(mk.property("ADBE Mask Feather").value); } catch (e) {}
                    try { mko.expansion = mk.property("ADBE Mask Offset").value; } catch (e) {}
                    info.masks.push(mko);
                }
            }
        } catch (e) {}

        info.markers = [];
        try {
            var mrk = layer.property("ADBE Marker");
            if (mrk && mrk.numKeys > 0) {
                for (var mm = 1; mm <= mrk.numKeys; mm++) {
                    var mv = mrk.keyValue(mm);
                    info.markers.push({ time: mrk.keyTime(mm), comment: mv.comment, duration: mv.duration });
                }
            }
        } catch (e) {}

        return JSON.stringify({ status: "success", comp: comp.name, layer: info }, null, 2);
    } catch (e) {
        return JSON.stringify({ status: "error", error: e.toString(), line: (e.line !== undefined ? e.line : null) }, null, 2);
    }
}

// Run arbitrary ExtendScript. The code runs as a function body, so "return value;"
// sends data back. Undo grouping is handled centrally in executeCommand.
function executeScript(args) {
    var code = (args && (args.script || args.code)) || "";
    if (!code) {
        return JSON.stringify({ status: "error", error: "No script provided. Pass 'script' containing ExtendScript code." });
    }
    try {
        var wrapped = "(function(){\n" + code + "\n})();";
        var __ret = eval(wrapped);
        try {
            return JSON.stringify({ status: "success", result: (__ret === undefined ? null : __ret) }, null, 2);
        } catch (serErr) {
            return JSON.stringify({ status: "success", result: String(__ret), note: "Result was not JSON-serializable; coerced to string." }, null, 2);
        }
    } catch (e) {
        return JSON.stringify({
            status: "error",
            error: e.toString(),
            message: (e.message ? e.message : String(e)),
            line: (e.line !== undefined ? e.line : null),
            fileName: (e.fileName !== undefined ? String(e.fileName) : null)
        }, null, 2);
    }
}

// Add a composition to the render queue and configure its output.
function addToRenderQueue(args) {
    try {
        var comp = _resolveComp(args);
        if (!comp) {
            return JSON.stringify({ status: "error", error: "Composition not found. Provide compName or compIndex, or open a comp." });
        }
        var rqItem = app.project.renderQueue.items.add(comp);

        if (args.renderSettingsTemplate) {
            try { rqItem.applyTemplate(args.renderSettingsTemplate); } catch (rErr) {}
        }
        if (args.outputModuleTemplate) {
            try { rqItem.outputModule(1).applyTemplate(args.outputModuleTemplate); } catch (tErr) {}
        }
        if (args.outputPath) {
            rqItem.outputModule(1).file = new File(args.outputPath);
        }
        if (args.startTime !== undefined) { rqItem.timeSpanStart = args.startTime; }
        if (args.endTime !== undefined) {
            var spanStart = (args.startTime !== undefined) ? args.startTime : 0;
            rqItem.timeSpanDuration = args.endTime - spanStart;
        }

        var omFile = null;
        try { omFile = rqItem.outputModule(1).file; } catch (e) {}
        return JSON.stringify({
            status: "success",
            message: "Added to render queue.",
            compName: comp.name,
            renderQueueIndex: app.project.renderQueue.numItems,
            outputPath: omFile ? omFile.fsName : null
        }, null, 2);
    } catch (e) {
        return JSON.stringify({ status: "error", error: e.toString(), line: (e.line !== undefined ? e.line : null) }, null, 2);
    }
}

// List, clear, or remove render queue items.
function manageRenderQueue(args) {
    try {
        var action = (args && args.action) ? args.action : "list";
        var rq = app.project.renderQueue;

        if (action === "clear") {
            while (rq.numItems > 0) { rq.item(1).remove(); }
            return JSON.stringify({ status: "success", message: "Render queue cleared.", numItems: 0 }, null, 2);
        }
        if (action === "remove") {
            if (args.index && args.index >= 1 && args.index <= rq.numItems) {
                rq.item(args.index).remove();
                return JSON.stringify({ status: "success", message: "Removed item " + args.index + ".", numItems: rq.numItems }, null, 2);
            }
            return JSON.stringify({ status: "error", error: "Invalid or missing index for remove." }, null, 2);
        }

        var statusMap = {};
        statusMap[RQItemStatus.QUEUED] = "QUEUED";
        statusMap[RQItemStatus.NEEDS_OUTPUT] = "NEEDS_OUTPUT";
        statusMap[RQItemStatus.UNQUEUED] = "UNQUEUED";
        statusMap[RQItemStatus.RENDERING] = "RENDERING";
        statusMap[RQItemStatus.DONE] = "DONE";
        statusMap[RQItemStatus.WILL_CONTINUE] = "WILL_CONTINUE";
        statusMap[RQItemStatus.ERR_STOPPED] = "ERR_STOPPED";
        statusMap[RQItemStatus.USER_STOPPED] = "USER_STOPPED";

        var items = [];
        for (var i = 1; i <= rq.numItems; i++) {
            var it = rq.item(i);
            var om = null;
            try { om = it.outputModule(1); } catch (e) {}
            items.push({
                index: i,
                compName: (it.comp ? it.comp.name : null),
                status: (statusMap[it.status] ? statusMap[it.status] : String(it.status)),
                outputPath: (om && om.file) ? om.file.fsName : null
            });
        }
        return JSON.stringify({ status: "success", numItems: rq.numItems, items: items }, null, 2);
    } catch (e) {
        return JSON.stringify({ status: "error", error: e.toString() }, null, 2);
    }
}

// Render all QUEUED items. BLOCKS After Effects until finished.
function startRender(args) {
    try {
        var rq = app.project.renderQueue;
        if (rq.numItems === 0) {
            return JSON.stringify({ status: "error", error: "Render queue is empty. Use addToRenderQueue first." }, null, 2);
        }
        var queued = 0;
        for (var i = 1; i <= rq.numItems; i++) {
            if (rq.item(i).status === RQItemStatus.QUEUED) { queued++; }
        }
        if (queued === 0) {
            return JSON.stringify({ status: "error", error: "No QUEUED items. Items may be NEEDS_OUTPUT (missing output path) or already DONE." }, null, 2);
        }
        var startMs = (new Date()).getTime();
        rq.render();
        var elapsed = ((new Date()).getTime() - startMs) / 1000;
        return JSON.stringify({ status: "success", message: "Render complete.", itemsRendered: queued, elapsedSeconds: elapsed }, null, 2);
    } catch (e) {
        return JSON.stringify({ status: "error", error: e.toString() }, null, 2);
    }
}

function executeCommand(command, args) {
    var result = "";
    
    logToPanel("Executing command: " + command);
    statusText.text = "Running: " + command;
    // panel.update() exists only on a floating Window, NOT on a dockable Panel
    // (calling it on a Panel throws "Function panel.update is undefined").
    if (panel instanceof Window) { panel.update(); }
    
    // Commands that drive AE's render pipeline must NOT run inside an open undo
    // group: RenderQueue.render() and CompItem.saveFrameToPng() open/close their
    // own internal undo transactions, which desyncs the begin/end nesting counter
    // and makes AE 2026 pop "Undo group mismatch, will attempt to fix." executeScript
    // runs arbitrary code that commonly renders/saves frames, so it is excluded too.
    // (These are still NOT read-only, so they stay out of READ_ONLY_COMMANDS and keep
    //  all other non-undo semantics; we only skip the auto undo group here.)
    var NO_UNDO_GROUP_COMMANDS = {
        "executeScript": true,
        "startRender": true,
        "addToRenderQueue": true,
        "manageRenderQueue": true,
        "seeFrame": true,
        "contactSheet": true,
        "matchReference": true
    };
    var useUndoGroup = !READ_ONLY_COMMANDS[command] && !NO_UNDO_GROUP_COMMANDS[command];
    // Suppress any AE modal for the whole execution so a dialog can never block the
    // single-threaded bridge poll loop (a blocked panel never writes the result file
    // -> automation hang). endSuppressDialogs(false) below clears it without alerting.
    var dialogsSuppressed = false;
    try { app.beginSuppressDialogs(); dialogsSuppressed = true; } catch (sdErr) {}
    try {
        logToPanel("Attempting to execute: " + command); // Log before switch
        if (useUndoGroup) { app.beginUndoGroup("MCP: " + command); }
        try {
        switch (command) {
            case "getProjectInfo":
                result = getProjectInfo();
                break;
            case "listCompositions":
                result = listCompositions();
                break;
            case "getLayerInfo":
                result = getLayerInfo();
                break;
            case "createComposition":
                logToPanel("Calling createComposition function...");
                result = createComposition(args);
                logToPanel("Returned from createComposition.");
                break;
            case "createTextLayer":
                logToPanel("Calling createTextLayer function...");
                result = createTextLayer(args);
                logToPanel("Returned from createTextLayer.");
                break;
            case "createShapeLayer":
                logToPanel("Calling createShapeLayer function...");
                result = createShapeLayer(args);
                logToPanel("Returned from createShapeLayer. Result type: " + typeof result);
                break;
            case "createSolidLayer":
                logToPanel("Calling createSolidLayer function...");
                result = createSolidLayer(args);
                logToPanel("Returned from createSolidLayer.");
                break;
            case "setLayerProperties":
                logToPanel("Calling setLayerProperties function...");
                result = setLayerProperties(args);
                logToPanel("Returned from setLayerProperties.");
                break;
            case "setLayerKeyframe":
                logToPanel("Calling setLayerKeyframe function...");
                result = setLayerKeyframe(args.compIndex, args.layerIndex, args.propertyName, args.timeInSeconds, args.value);
                logToPanel("Returned from setLayerKeyframe.");
                break;
            case "setLayerExpression":
                logToPanel("Calling setLayerExpression function...");
                result = setLayerExpression(args.compIndex, args.layerIndex, args.propertyName, args.expressionString);
                logToPanel("Returned from setLayerExpression.");
                break;
            case "applyEffect":
                logToPanel("Calling applyEffect function...");
                result = applyEffect(args);
                logToPanel("Returned from applyEffect.");
                break;
            case "applyEffectTemplate":
                logToPanel("Calling applyEffectTemplate function...");
                result = applyEffectTemplate(args);
                logToPanel("Returned from applyEffectTemplate.");
                break;
            case "listLayerEffects":
                logToPanel("Calling listLayerEffects function...");
                result = listLayerEffects(args);
                logToPanel("Returned from listLayerEffects.");
                break;
            case "listAvailableEffects":
                logToPanel("Calling listAvailableEffects function...");
                result = listAvailableEffects(args);
                logToPanel("Returned from listAvailableEffects.");
                break;
            case "setEffectProperty":
                logToPanel("Calling setEffectProperty function...");
                result = setEffectProperty(args);
                logToPanel("Returned from setEffectProperty.");
                break;
            case "setEffectKeyframe":
                logToPanel("Calling setEffectKeyframe function...");
                result = setEffectKeyframe(args);
                logToPanel("Returned from setEffectKeyframe.");
                break;
            case "applyLayerPreset":
                logToPanel("Calling applyLayerPreset function...");
                result = applyLayerPreset(args);
                logToPanel("Returned from applyLayerPreset.");
                break;
            case "createAdjustmentLayer":
                logToPanel("Calling createAdjustmentLayer function...");
                result = createAdjustmentLayer(args);
                logToPanel("Returned from createAdjustmentLayer.");
                break;
            case "centerLayers":
                logToPanel("Calling centerLayers function...");
                result = centerLayers(args);
                logToPanel("Returned from centerLayers.");
                break;
            case "getLayerClipFrames":
                logToPanel("Calling getLayerClipFrames function...");
                result = getLayerClipFrames(args);
                logToPanel("Returned from getLayerClipFrames.");
                break;
            case "getLayerAudioInfo":
                logToPanel("Calling getLayerAudioInfo function...");
                result = getLayerAudioInfo(args);
                logToPanel("Returned from getLayerAudioInfo.");
                break;
            case "addMarkersFromArray":
                logToPanel("Calling addMarkersFromArray function...");
                result = addMarkersFromArray(args);
                logToPanel("Returned from addMarkersFromArray.");
                break;
            case "addMarker":
                logToPanel("Calling addMarker function...");
                result = addMarker(args);
                logToPanel("Returned from addMarker.");
                break;
            case "setLayerAudioLevels":
                logToPanel("Calling setLayerAudioLevels function...");
                result = setLayerAudioLevels(args);
                logToPanel("Returned from setLayerAudioLevels.");
                break;
            case "removeLayerEffect":
                logToPanel("Calling removeLayerEffect function...");
                result = removeLayerEffect(args);
                logToPanel("Returned from removeLayerEffect.");
                break;
            case "bridgeTestEffects":
                logToPanel("Calling bridgeTestEffects function...");
                result = bridgeTestEffects(args);
                logToPanel("Returned from bridgeTestEffects.");
                break;
            case "executeScript":
                logToPanel("Calling executeScript function...");
                result = executeScript(args);
                logToPanel("Returned from executeScript.");
                break;
            case "seeFrame":
                logToPanel("Calling seeFrame function...");
                result = seeFrame(args);
                logToPanel("Returned from seeFrame.");
                break;
            case "contactSheet":
                logToPanel("Calling contactSheet function...");
                result = contactSheet(args);
                logToPanel("Returned from contactSheet.");
                break;
            case "matchReference":
                logToPanel("Calling matchReference function...");
                result = matchReference(args);
                logToPanel("Returned from matchReference.");
                break;
            case "getLayerFull":
                logToPanel("Calling getLayerFull function...");
                result = getLayerFull(args);
                logToPanel("Returned from getLayerFull.");
                break;
            case "getCompFull":
                logToPanel("Calling getCompFull function...");
                result = getCompFull(args);
                logToPanel("Returned from getCompFull.");
                break;
            case "createCamera":
                logToPanel("Calling createCamera function...");
                result = createCamera(args);
                logToPanel("Returned from createCamera.");
                break;
            case "duplicateLayer":
                logToPanel("Calling duplicateLayer function...");
                result = duplicateLayer(args);
                logToPanel("Returned from duplicateLayer.");
                break;
            case "deleteLayer":
                logToPanel("Calling deleteLayer function...");
                result = deleteLayer(args);
                logToPanel("Returned from deleteLayer.");
                break;
            case "setLayerMask":
                logToPanel("Calling setLayerMask function...");
                result = setLayerMask(args);
                logToPanel("Returned from setLayerMask.");
                break;
            case "batchSetLayerProperties":
                logToPanel("Calling batchSetLayerProperties function...");
                result = batchSetLayerProperties(args);
                logToPanel("Returned from batchSetLayerProperties.");
                break;
            case "setCompositionProperties":
                logToPanel("Calling setCompositionProperties function...");
                result = setCompositionProperties(args);
                logToPanel("Returned from setCompositionProperties.");
                break;
            case "addToRenderQueue":
                logToPanel("Calling addToRenderQueue function...");
                result = addToRenderQueue(args);
                logToPanel("Returned from addToRenderQueue.");
                break;
            case "manageRenderQueue":
                logToPanel("Calling manageRenderQueue function...");
                result = manageRenderQueue(args);
                logToPanel("Returned from manageRenderQueue.");
                break;
            case "startRender":
                logToPanel("Calling startRender function...");
                result = startRender(args);
                logToPanel("Returned from startRender.");
                break;
            case "ping":
                result = JSON.stringify({
                    status: "success",
                    pong: true,
                    bridgeVersion: BRIDGE_VERSION,
                    aeVersion: (app && app.version ? app.version : null),
                    bridgeFolder: getBridgeFolder().fsName,
                    project: (app.project && app.project.file ? app.project.file.name : "Untitled Project"),
                    activeComp: (app.project && app.project.activeItem instanceof CompItem ? app.project.activeItem.name : null)
                });
                break;
            default:
                result = JSON.stringify({ error: "Unknown command: " + command });
        }
        } finally {
            if (useUndoGroup) { try { app.endUndoGroup(); } catch (ueg) {} }
        }
        // Pair with beginSuppressDialogs above. Pass false so AE does NOT replay any
        // suppressed alert (replaying would re-pop the very modal we are avoiding).
        if (dialogsSuppressed) { try { app.endSuppressDialogs(false); dialogsSuppressed = false; } catch (esd) {} }
        logToPanel("Execution finished for: " + command); // Log after switch
        logToPanel("Preparing to write result file...");
        var resultString = (typeof result === 'string') ? result : JSON.stringify(result);
        try {
            var resultObj = JSON.parse(resultString);
            resultObj._responseTimestamp = new Date().toISOString();
            resultObj._commandExecuted = command;
            resultObj._commandId = currentCommandId;
            resultString = JSON.stringify(resultObj, null, 2);
            logToPanel("Added timestamp to result JSON for tracking freshness.");
        } catch (parseError) {
            // Handler returned a non-JSON string. Wrap it in a JSON envelope that
            // still carries the tracking fields, otherwise the server can neither
            // parse nor id-match it and the tool hangs the full timeout (#15).
            logToPanel("Result was not JSON; wrapping it so the server can match it: " + parseError.toString());
            resultString = JSON.stringify({
                status: "success",
                result: ("" + resultString),
                _responseTimestamp: new Date().toISOString(),
                _commandExecuted: command,
                _commandId: currentCommandId
            }, null, 2);
        }
        
        var resultFile = new File(getResultFilePath());
        resultFile.encoding = "UTF-8"; 
        logToPanel("Opening result file for writing...");
        var opened = resultFile.open("w");
        if (!opened) {
            logToPanel("ERROR: Failed to open result file for writing: " + resultFile.fsName);
            throw new Error("Failed to open result file for writing.");
        }
        logToPanel("Writing to result file...");
        var written = resultFile.write(resultString);
        if (!written) {
             logToPanel("ERROR: Failed to write to result file (write returned false): " + resultFile.fsName);
             
        }
        logToPanel("Closing result file...");
        var closed = resultFile.close();
         if (!closed) {
             logToPanel("ERROR: Failed to close result file: " + resultFile.fsName);
             
        }
        logToPanel("Result file write process complete.");
        
        logToPanel("Command completed successfully: " + command);
        statusText.text = "Command completed: " + command;
        // The freshly written result file (carrying _commandId) is the signal the
        // server waits on; we deliberately do NOT write a status back into the
        // command file, to avoid racing with the server's next command write.
    } catch (error) {
        // Ensure dialog suppression is lifted even on the error path (the success-path
        // close above only runs if execution reached it; a failure before the switch
        // would otherwise leave dialogs suppressed for later commands). Idempotent via
        // the dialogsSuppressed flag, so it is a safe no-op if already cleared.
        if (dialogsSuppressed) { try { app.endSuppressDialogs(false); dialogsSuppressed = false; } catch (esd2) {} }
        var errorMsg = "ERROR in executeCommand for '" + command + "': " + error.toString() + (error.line ? " (line: " + error.line + ")" : "");
        logToPanel(errorMsg);
        statusText.text = "Error: " + error.toString();
        
        
        try {
            logToPanel("Attempting to write ERROR to result file...");
            var errorResult = JSON.stringify({
                status: "error",
                command: command,
                message: error.toString(),
                line: error.line,
                fileName: error.fileName,
                // Echo the same tracking fields the success path adds, so the
                // server can match this error to the exact command that caused
                // it (otherwise the tool reports a bogus "Timed out" instead of
                // the real AE error). See index.ts waitForBridgeResult matching.
                _commandExecuted: command,
                _commandId: currentCommandId,
                _responseTimestamp: new Date().toISOString()
            });
            var errorFile = new File(getResultFilePath());
            errorFile.encoding = "UTF-8";
            if (errorFile.open("w")) {
                errorFile.write(errorResult);
                errorFile.close();
                logToPanel("Successfully wrote ERROR to result file.");
            } else {
                 logToPanel("CRITICAL ERROR: Failed to open result file to write error!");
            }
        } catch (writeError) {
             logToPanel("CRITICAL ERROR: Failed to write error to result file: " + writeError.toString());
        }
        // As on the success path, the error result file (with _commandId) is the
        // signal to the server; no status is written back into the command file.
    }
}


function logToPanel(message) {
    var timestamp = new Date().toLocaleTimeString();
    logText.text = timestamp + ": " + message + "\n" + logText.text;
}


function checkForCommands() {
    // The repeating scheduled task can outlive the panel: when the panel is closed
    // its widgets are destroyed and become invalid. Touching one then throws
    // "Object is invalid" (and the modal blanks the reopened panel). So if our UI is
    // gone, cancel this stale task and bail silently instead of throwing.
    var autoOn;
    try { autoOn = autoRunCheckbox.value; }
    catch (invalidWidget) {
        try { if ($.global.mcpCheckTaskId != null) app.cancelTask($.global.mcpCheckTaskId); } catch (e) {}
        return;
    }
    if (!autoOn || isChecking) return;
    
    isChecking = true;
    
    try {
        var commandFile = new File(getCommandFilePath());
        if (commandFile.exists) {
            // Node writes the command file as UTF-8 (no BOM). Force UTF-8 decoding
            // so non-ASCII argument values (Arabic / RTL text) are read correctly.
            commandFile.encoding = "UTF-8";
            commandFile.open("r");
            var content = commandFile.read();
            commandFile.close();

            if (content) {
                var commandData = (typeof JSON !== "undefined" && JSON.parse)
                    ? JSON.parse(content)
                    : eval("(" + content + ")");

                // Run a command at most once, keyed on the server-issued commandId
                // (falling back to timestamp for an older server). We do NOT write a
                // "status" back into the command file: that file is owned/overwritten
                // by the server, and a read-modify-write here would race with the
                // next command's write. The result file's _commandId is what the
                // server matches on, so this dedup is purely AE-local.
                var commandKey = commandData.commandId || commandData.timestamp || "";
                if (commandKey && commandKey !== lastProcessedCommandId) {
                    lastProcessedCommandId = commandKey;
                    currentCommandId = commandData.commandId || "";
                    executeCommand(commandData.command, commandData.args || {});
                }
            }
        }
    } catch (e) {
        logToPanel("Error checking for commands: " + e.toString());
    }
    
    isChecking = false;
}


// On startup, seed the dedup key from whatever command is already sitting in the
// bridge folder so we don't replay a stale command the server long since abandoned
// (e.g. a destructive deleteLayer/startRender left over from a previous session).
// Only commands that ARRIVE after the panel is listening will run.
function initLastProcessedCommand() {
    try {
        var commandFile = new File(getCommandFilePath());
        if (commandFile.exists) {
            commandFile.encoding = "UTF-8";
            commandFile.open("r");
            var content = commandFile.read();
            commandFile.close();
            if (content) {
                var commandData = JSON.parse(content);
                lastProcessedCommandId = commandData.commandId || commandData.timestamp || "";
                logToPanel("Ignoring pre-existing command (key " + lastProcessedCommandId + ") from a previous session.");
            }
        }
    } catch (e) {
        // If we cannot read it, leave the key empty; worst case one stale command runs.
        logToPanel("Could not seed last-processed command: " + e.toString());
    }
}

function startCommandChecker() {
    // Cancel any task left scheduled by a previous panel instance. Panels are re-run
    // on close+reopen; without this the old repeating task keeps firing (hitting
    // destroyed widgets) and duplicates accumulate. $.global survives the re-run, so
    // it is where we stash the live task id to find and kill the stale one.
    try { if ($.global.mcpCheckTaskId != null) app.cancelTask($.global.mcpCheckTaskId); } catch (e) {}
    $.global.mcpCheckTaskId = app.scheduleTask("checkForCommands()", checkInterval, true);
}


var checkButton = panel.add("button", undefined, "Check for Commands Now");
checkButton.onClick = function() {
    logToPanel("Manually checking for commands");
    checkForCommands();
};


logToPanel("MCP Bridge Auto started");
logToPanel("Command file: " + getCommandFilePath());
statusText.text = "Ready - Auto-run is " + (autoRunCheckbox.value ? "ON" : "OFF");


initLastProcessedCommand();
startCommandChecker();


if (panel instanceof Window) {
    // Floating palette path (File > Scripts > Run Script File)
    panel.layout.layout(true);
    panel.center();
    panel.show();
} else {
    // Docked Panel path (Window > mcp-bridge-auto.jsx) - never call .show()/.center().
    panel.layout.layout(true);
    // Give the layout a shrink floor so a narrow dock doesn't collapse to "blank"
    // (logText has a fixed 200px height; a docked panel won't auto-size to content).
    if (panel.children && panel.children.length) {
        panel.minimumSize = [220, 160];
    }
    panel.layout.resize();
    panel.onResizing = panel.onResize = function () { this.layout.resize(); };
}

