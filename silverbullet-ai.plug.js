var we=Object.defineProperty;var b=(e,t)=>{for(var r in t)we(e,r,{get:t[r],enumerable:!0})};var K=typeof window>"u"&&typeof globalThis.WebSocketPair>"u";typeof Deno>"u"&&(self.Deno={args:[],build:{arch:"x86_64"},env:{get(){}}});var D=new Map,U=0;function O(e){self.postMessage(e)}K&&(globalThis.syscall=async(e,...t)=>await new Promise((r,n)=>{U++,D.set(U,{resolve:r,reject:n}),O({type:"sys",id:U,name:e,args:t})}));function _(e,t){K&&(self.addEventListener("message",r=>{(async()=>{let n=r.data;switch(n.type){case"inv":{let o=e[n.name];if(!o)throw new Error(`Function not loaded: ${n.name}`);try{let s=await Promise.resolve(o(...n.args||[]));O({type:"invr",id:n.id,result:s})}catch(s){console.error("An exception was thrown as a result of invoking function",n.name,"error:",s.message),O({type:"invr",id:n.id,error:s.message})}}break;case"sysr":{let o=n.id,s=D.get(o);if(!s)throw Error("Invalid request id");D.delete(o),n.error?s.reject(new Error(n.error)):s.resolve(n.result)}break}})().catch(console.error)}),O({type:"manifest",manifest:t}))}function Te(e){let t=atob(e),r=t.length,n=new Uint8Array(r);for(let o=0;o<r;o++)n[o]=t.charCodeAt(o);return n}function Y(e){typeof e=="string"&&(e=new TextEncoder().encode(e));let t="",r=e.byteLength;for(let n=0;n<r;n++)t+=String.fromCharCode(e[n]);return btoa(t)}async function j(e,t){if(typeof e!="string"){let r=new Uint8Array(await e.arrayBuffer()),n=r.length>0?Y(r):void 0;t={method:e.method,headers:Object.fromEntries(e.headers.entries()),base64Body:n},e=e.url}return syscall("sandboxFetch.fetch",e,t)}globalThis.nativeFetch=globalThis.fetch;function Ae(){globalThis.fetch=async function(e,t){let r=t&&t.body?Y(new Uint8Array(await new Response(t.body).arrayBuffer())):void 0,n=await j(e,t&&{method:t.method,headers:t.headers,base64Body:r});return new Response(n.base64Body?Te(n.base64Body):null,{status:n.status,headers:n.headers})}}K&&Ae();var x=globalThis.syscall;var d={};b(d,{parse:()=>Ee,stringify:()=>Ie});function Ee(e){return x("yaml.parse",e)}function Ie(e){return x("yaml.stringify",e)}function q(e){if(e.children)for(let t of e.children){if(t.parent)return;t.parent=e,q(t)}}function $(e,t){if(t(e))return[e];let r=[];if(e.children)for(let n of e.children)r=[...r,...$(n,t)];return r}async function G(e,t){if(await t(e))return[e];let r=[];if(e.children)for(let n of e.children)r=[...r,...await G(n,t)];return r}async function B(e,t){if(e.children){let r=e.children.slice();for(let n of r){let o=await t(n);if(o!==void 0){let s=e.children.indexOf(n);o?e.children.splice(s,1,o):e.children.splice(s,1)}else await B(n,t)}}}function W(e,t){return $(e,r=>r.type===t)[0]}function V(e,t){$(e,t)}async function z(e,t){await G(e,t)}function P(e){if(!e)return"";let t=[];if(e.text!==void 0)return e.text;for(let r of e.children)t.push(P(r));return t.join("")}function N(e){if(!e||typeof e!="object")return e;if(Array.isArray(e))return e.map(N);let t={};for(let r of Object.keys(e)){let n=r.split("."),o=t;for(let s=0;s<n.length-1;s++){let c=n[s];o[c]||(o[c]={}),o=o[c]}o[n[n.length-1]]=N(e[r])}return t}async function w(e,t={}){let r={tags:[]},n=[];return q(e),await B(e,async o=>{if(o.type==="Paragraph"&&o.parent?.type==="Document"){let s=!0,c=new Set;for(let l of o.children)if(l.text){if(l.text.startsWith(`
`)&&l.text!==`
`)break;if(l.text.trim()){s=!1;break}}else if(l.type==="Hashtag"){let m=l.children[0].text.substring(1);c.add(m),(t.removeTags===!0||t.removeTags?.includes(m))&&(l.children[0].text="")}else if(l.type){s=!1;break}s&&n.push(...c)}if(o.type==="FrontMatter"){let s=o.children[1].children[0],c=P(s);try{let l=await d.parse(c),m={...l};if(r={...r,...l},r.tags||(r.tags=[]),typeof r.tags=="string"&&n.push(...r.tags.split(/,\s*|\s+/)),Array.isArray(r.tags)&&n.push(...r.tags),t.removeKeys&&t.removeKeys.length>0){let p=!1;for(let f of t.removeKeys)f in m&&(delete m[f],p=!0);p&&(s.text=await d.stringify(m))}if(Object.keys(m).length===0||t.removeFrontmatterSection)return null}catch(l){console.warn("Could not parse frontmatter",l.message)}}}),r.tags=[...new Set([...n.map(o=>o.replace(/^#/,""))])],r=N(r),r}async function Q(e,t){let r=null;if(await z(e,async n=>{if(n.type==="FrontMatter"){let o=n.children[1].children[0],s=P(o);try{let c="";if(typeof t=="string")c=s+t+`
`;else{let m={...await d.parse(s),...t};c=await d.stringify(m)}r={changes:{from:o.from,to:o.to,insert:c}}}catch(c){console.error("Error parsing YAML",c)}return!0}return!1}),!r){let n="";typeof t=="string"?n=t+`
`:n=await d.stringify(t),r={changes:{from:0,to:0,insert:`---
`+n+`---
`}}}return r}var a={};b(a,{confirm:()=>ot,dispatch:()=>rt,downloadFile:()=>Ge,filterBox:()=>Qe,flashNotification:()=>ze,fold:()=>ct,foldAll:()=>pt,getCurrentPage:()=>Ne,getCursor:()=>Le,getSelection:()=>Re,getText:()=>ke,getUiOption:()=>st,goHistory:()=>Ye,hidePanel:()=>Je,insertAtCursor:()=>tt,insertAtPos:()=>Xe,moveCursor:()=>et,navigate:()=>Ke,openCommandPalette:()=>qe,openPageNavigator:()=>je,openSearchPanel:()=>dt,openUrl:()=>_e,prompt:()=>nt,reloadPage:()=>$e,reloadSettingsAndCommands:()=>We,reloadUI:()=>Be,replaceRange:()=>Ze,save:()=>De,setPage:()=>Me,setSelection:()=>Ue,setText:()=>Fe,setUiOption:()=>it,showPanel:()=>He,toggleFold:()=>mt,unfold:()=>lt,unfoldAll:()=>ut,uploadFile:()=>Ve,vimEx:()=>at});typeof self>"u"&&(self={syscall:()=>{throw new Error("Not implemented here")}});var i=self.syscall;function Ne(){return i("editor.getCurrentPage")}function Me(e){return i("editor.setPage",e)}function ke(){return i("editor.getText")}function Fe(e){return i("editor.setText",e)}function Le(){return i("editor.getCursor")}function Re(){return i("editor.getSelection")}function Ue(e,t){return i("editor.setSelection",e,t)}function De(){return i("editor.save")}function Ke(e,t=!1,r=!1){return i("editor.navigate",e,t,r)}function je(e="page"){return i("editor.openPageNavigator",e)}function qe(){return i("editor.openCommandPalette")}function $e(){return i("editor.reloadPage")}function Be(){return i("editor.reloadUI")}function We(){return i("editor.reloadSettingsAndCommands")}function _e(e,t=!1){return i("editor.openUrl",e,t)}function Ye(e){return i("editor.goHistory",e)}function Ge(e,t){return i("editor.downloadFile",e,t)}function Ve(e,t){return i("editor.uploadFile",e,t)}function ze(e,t="info"){return i("editor.flashNotification",e,t)}function Qe(e,t,r="",n=""){return i("editor.filterBox",e,t,r,n)}function He(e,t,r,n=""){return i("editor.showPanel",e,t,r,n)}function Je(e){return i("editor.hidePanel",e)}function Xe(e,t){return i("editor.insertAtPos",e,t)}function Ze(e,t,r){return i("editor.replaceRange",e,t,r)}function et(e,t=!1){return i("editor.moveCursor",e,t)}function tt(e){return i("editor.insertAtCursor",e)}function rt(e){return i("editor.dispatch",e)}function nt(e,t=""){return i("editor.prompt",e,t)}function ot(e){return i("editor.confirm",e)}function st(e){return i("editor.getUiOption",e)}function it(e,t){return i("editor.setUiOption",e,t)}function at(e){return i("editor.vimEx",e)}function ct(){return i("editor.fold")}function lt(){return i("editor.unfold")}function mt(){return i("editor.toggleFold")}function pt(){return i("editor.foldAll")}function ut(){return i("editor.unfoldAll")}function dt(){return i("editor.openSearchPanel")}var y={};b(y,{parseMarkdown:()=>ft});function ft(e){return i("markdown.parseMarkdown",e)}var g={};b(g,{deleteAttachment:()=>bt,deleteFile:()=>Nt,deletePage:()=>Pt,getAttachmentMeta:()=>At,getFileMeta:()=>Ct,getPageMeta:()=>ht,listAttachments:()=>Tt,listFiles:()=>Et,listPages:()=>gt,listPlugs:()=>wt,readAttachment:()=>vt,readFile:()=>It,readPage:()=>yt,writeAttachment:()=>St,writeFile:()=>Ot,writePage:()=>xt});function gt(e=!1){return i("space.listPages",e)}function ht(e){return i("space.getPageMeta",e)}function yt(e){return i("space.readPage",e)}function xt(e,t){return i("space.writePage",e,t)}function Pt(e){return i("space.deletePage",e)}function wt(){return i("space.listPlugs")}function Tt(){return i("space.listAttachments")}function At(e){return i("space.getAttachmentMeta",e)}function vt(e){return i("space.readAttachment",e)}function St(e,t){return i("space.writeAttachment",e,t)}function bt(e){return i("space.deleteAttachment",e)}function Et(){return i("space.listFiles")}function It(e){return i("space.readFile",e)}function Ct(e){return i("space.getFileMeta",e)}function Ot(e,t){return i("space.writeFile",e,t)}function Nt(e){return i("space.deleteFile",e)}function H(e,...t){return i("system.invokeFunction",e,...t)}var E={};b(E,{parseTemplate:()=>Dt,renderTemplate:()=>Ut});function Ut(e,t,r={}){return i("template.renderTemplate",e,t,r)}function Dt(e){return i("template.parseTemplate",e)}var br=new TextEncoder;function J(e){let t=atob(e),r=t.length,n=new Uint8Array(r);for(let o=0;o<r;o++)n[o]=t.charCodeAt(o);return n}async function jt(){let e=await a.getSelection(),t="";return e.from===e.to?t="":t=(await a.getText()).slice(e.from,e.to),{from:e.from,to:e.to,text:t}}async function M(){let e=await jt(),t=await a.getText();if(e.text==="")return{from:0,to:t.length,text:t,isWholeNote:!0};let r=e.from===0&&e.to===t.length;return{...e,isWholeNote:r}}async function T(){return(await a.getText()).length}async function qt(e,t){let r=await g.readPage(e),n=await y.parseMarkdown(r),o;return V(n,s=>{if(s.type!=="FencedCode")return!1;let c=W(s,"CodeInfo");if(t&&!c||t&&!t.includes(c.children[0].text))return!1;let l=W(s,"CodeText");return l?(o=l.children[0].text,!0):!1}),o}async function k(e,t=["yaml"]){let r=await qt(e,t);if(r!==void 0)try{return d.parse(r)}catch(n){throw console.error("YAML Page parser error",n),new Error(`YAML Error: ${n.message}`)}}var $t="SETTINGS";async function X(e,t){try{let n=(await k($t,["yaml"])||{})[e];return n===void 0?t:n}catch(r){if(r.message==="Not found")return t;throw r}}async function Z(e){try{let r=(await k("SECRETS",["yaml","secrets"]))[e];if(r===void 0)throw new Error(`No such secret: ${e}`);return r}catch(t){throw t.message==="Not found"?new Error(`No such secret: ${e}`):t}}var h,u;async function A(){let e=await Z("OPENAI_API_KEY");if(e!==h&&(h=e,console.log("silverbullet-ai API key updated")),!h){let o="OpenAI API key is missing. Please set it in the secrets page.";throw await a.flashNotification(o,"error"),new Error(o)}let t={defaultTextModel:"gpt-3.5-turbo",openAIBaseUrl:"https://api.openai.com/v1",dallEBaseUrl:"https://api.openai.com/v1",requireAuth:!0},r=await X("ai",{}),n={...t,...r};JSON.stringify(u)!==JSON.stringify(n)?(console.log("aiSettings updating from",u),u=n,console.log("aiSettings updated to",u)):console.log("aiSettings unchanged",u)}var I=function(e,t){if(!(this instanceof I))return new I(e,t);this.INITIALIZING=-1,this.CONNECTING=0,this.OPEN=1,this.CLOSED=2,this.url=e,t=t||{},this.headers=t.headers||{},this.payload=t.payload!==void 0?t.payload:"",this.method=t.method||this.payload&&"POST"||"GET",this.withCredentials=!!t.withCredentials,this.debug=!!t.debug,this.FIELD_SEPARATOR=":",this.listeners={},this.xhr=null,this.readyState=this.INITIALIZING,this.progress=0,this.chunk="",this.addEventListener=function(r,n){this.listeners[r]===void 0&&(this.listeners[r]=[]),this.listeners[r].indexOf(n)===-1&&this.listeners[r].push(n)},this.removeEventListener=function(r,n){if(this.listeners[r]!==void 0){var o=[];this.listeners[r].forEach(function(s){s!==n&&o.push(s)}),o.length===0?delete this.listeners[r]:this.listeners[r]=o}},this.dispatchEvent=function(r){if(!r)return!0;this.debug&&console.debug(r),r.source=this;var n="on"+r.type;return this.hasOwnProperty(n)&&(this[n].call(this,r),r.defaultPrevented)?!1:this.listeners[r.type]?this.listeners[r.type].every(function(o){return o(r),!r.defaultPrevented}):!0},this._setReadyState=function(r){var n=new CustomEvent("readystatechange");n.readyState=r,this.readyState=r,this.dispatchEvent(n)},this._onStreamFailure=function(r){var n=new CustomEvent("error");n.data=r.currentTarget.response,this.dispatchEvent(n),this.close()},this._onStreamAbort=function(r){this.dispatchEvent(new CustomEvent("abort")),this.close()},this._onStreamProgress=function(r){if(this.xhr){if(this.xhr.status!==200){this._onStreamFailure(r);return}this.readyState==this.CONNECTING&&(this.dispatchEvent(new CustomEvent("open")),this._setReadyState(this.OPEN));var n=this.xhr.responseText.substring(this.progress);this.progress+=n.length;var o=(this.chunk+n).split(/(\r\n\r\n|\r\r|\n\n)/g),s=o.pop();o.forEach(function(c){c.trim().length>0&&this.dispatchEvent(this._parseEventChunk(c))}.bind(this)),this.chunk=s}},this._onStreamLoaded=function(r){this._onStreamProgress(r),this.dispatchEvent(this._parseEventChunk(this.chunk)),this.chunk=""},this._parseEventChunk=function(r){if(!r||r.length===0)return null;this.debug&&console.debug(r);var n={id:null,retry:null,data:null,event:null};r.split(/\n|\r\n|\r/).forEach(function(s){var c=s.indexOf(this.FIELD_SEPARATOR),l,m;if(c>0){var p=s[c+1]===" "?2:1;l=s.substring(0,c),m=s.substring(c+p)}else if(c<0)l=s,m="";else return;l in n&&(l==="data"&&n[l]!==null?n.data+=`
`+m:n[l]=m)}.bind(this));var o=new CustomEvent(n.event||"message");return o.data=n.data||"",o.id=n.id,o},this._checkStreamClosed=function(){this.xhr&&this.xhr.readyState===XMLHttpRequest.DONE&&this._setReadyState(this.CLOSED)},this.stream=function(){if(!this.xhr){this._setReadyState(this.CONNECTING),this.xhr=new XMLHttpRequest,this.xhr.addEventListener("progress",this._onStreamProgress.bind(this)),this.xhr.addEventListener("load",this._onStreamLoaded.bind(this)),this.xhr.addEventListener("readystatechange",this._checkStreamClosed.bind(this)),this.xhr.addEventListener("error",this._onStreamFailure.bind(this)),this.xhr.addEventListener("abort",this._onStreamAbort.bind(this)),this.xhr.open(this.method,this.url);for(var r in this.headers)this.xhr.setRequestHeader(r,this.headers[r]);this.xhr.withCredentials=this.withCredentials,this.xhr.send(this.payload)}},this.close=function(){this.readyState!==this.CLOSED&&(this.xhr.abort(),this.xhr=null,this._setReadyState(this.CLOSED))},(t.start===void 0||t.start)&&this.stream()};typeof exports<"u"&&(exports.SSE=I);async function v(e,t=void 0,r=!1){try{h||await A();let o=`${u.openAIBaseUrl}/chat/completions`,s;"systemMessage"in e&&"userMessage"in e?s=[{role:"system",content:e.systemMessage},{role:"user",content:e.userMessage}]:s=e;var n={"Content-Type":"application/json"};u.requireAuth&&(n.Authorization=`Bearer ${h}`);let c={method:"POST",headers:n,payload:JSON.stringify({model:u.defaultTextModel,stream:!0,messages:s}),withCredentials:!1},l=new I(o,c),m;t?m=t:m=await T();let p=" \u{1F914} Thinking \u2026\u2026 ";await a.insertAtPos(p,m);let f=!0,Bt=async()=>{for(;f;){let S=m+p.length;currentStateIndex=(currentStateIndex+1)%spinnerStates.length,p=` \u{1F914} Thinking ${spinnerStates[currentStateIndex]} \u2026`,await a.replaceRange(m,S,p),await new Promise(C=>setTimeout(C,250))}};l.addEventListener("message",function(S){try{if(S.data=="[DONE]")l.close(),f=!1;else{let R=JSON.parse(S.data).choices[0]?.delta?.content||"";f?(f=!1,a.replaceRange(m,m+p.length,R)):a.insertAtPos(R,m),m+=R.length}r&&a.moveCursor(m,!0)}catch(C){console.error("Error processing message event:",C,S.data)}}),l.addEventListener("end",function(){l.close()}),l.stream()}catch(o){throw console.error("Error streaming from OpenAI chat endpoint:",o),await a.flashNotification("Error streaming from OpenAI chat endpoint.","error"),o}}async function F(e,t){try{if(h||await A(),!h||!u||!u.openAIBaseUrl)throw new Error("API key or AI settings are not properly configured.");let r=JSON.stringify({model:u.defaultTextModel,messages:[{role:"system",content:e},...t]});console.log("Sending body",r);let n={Authorization:`Bearer ${h}`,"Content-Type":"application/json"};console.log("Request headers:",n);let o=await j(u.openAIBaseUrl+"/chat/completions",{method:"POST",headers:n,body:r});if(!o.ok)throw console.error("http response: ",o),console.error("http response body: ",await o.json()),new Error(`HTTP error, status: ${o.status}`);let s=await o.json();if(!s||!s.choices||s.choices.length===0)throw new Error("Invalid response from OpenAI.");return s}catch(r){throw console.error("Error calling OpenAI chat endpoint:",r),r}}async function ee(e,t,r="1024x1024",n="hd"){try{h||await A(),await a.flashNotification("Contacting DALL\xB7E, please wait...");let o=await fetch(u.dallEBaseUrl+"/images/generations",{method:"POST",headers:{Authorization:`Bearer ${h}`,"Content-Type":"application/json"},body:JSON.stringify({model:"dall-e-3",prompt:e,quality:n,n:t,size:r,response_format:"b64_json"})});if(!o.ok)throw new Error(`HTTP error, status: ${o.status}`);return await o.json()}catch(o){throw console.error("Error calling DALL\xB7E image generation endpoint:",o),o}}function te(e){return e.split("/").slice(0,-1).join("/")}async function re(){let t=(await a.getText()).split(`
`),r=[],n="user",o="";return t.forEach(s=>{let c=s.match(/^\*\*(\w+)\*\*:/);if(c){let l=c[1].toLowerCase();n&&n!==l&&(r.push({role:n,content:o.trim()}),o=""),n=l,o+=s.replace(/^\*\*(\w+)\*\*:/,"").trim()+`
`}else n&&(o+=s.trim()+`
`)}),o&&n&&r.push({role:n,content:o.trim()}),r}async function ne(e){(e==="SETTINGS"||e==="SECRETS")&&await A()}async function oe(){let e=await M();if(console.log("selectedTextInfo",e),e.text.length>0){let t=await a.getCurrentPage(),r=await F("You are an AI Note assistant here to help summarize the user's personal notes.",[{role:"user",content:`Please summarize this note using markdown for any formatting.  Your summary will be appended to the end of this note, do not include any of the note contents yourself.  Keep the summary brief. The note name is ${t}.

${e.text}`}]);return console.log("OpenAI response:",r),{summary:r.choices[0].message.content,selectedTextInfo:e}}return{summary:"",selectedTextInfo:null}}async function se(){let e=await M(),t=await a.prompt("Please enter a prompt to send to the LLM. Selected text or the entire note will also be sent as context."),r=await a.getCurrentPage(),n=new Date,o=n.toISOString().split("T")[0],s=n.toLocaleDateString("en-US",{weekday:"long"});await v({systemMessage:"You are an AI note assistant.  Follow all user instructions and use the note context and note content to help follow those instructions.  Use Markdown for any formatting.",userMessage:`Note Context: Today is ${s}, ${o}. The current note name is "${r}".
User Prompt: ${t}
Note Content:
${e.text}`},e.isWholeNote?void 0:e.to)}async function ie(){let{summary:e}=await oe();e?await a.showPanel("rhs",2,e):await a.flashNotification("No summary available.")}async function ae(){let{summary:e,selectedTextInfo:t}=await oe();e&&t&&await a.insertAtPos(`

`+e,t.to)}async function ce(){let e=await a.getText(),t=await a.getCurrentPage(),n=(await F("You are an AI tagging assistant. Please provide a short list of tags, separated by spaces. Only return tags and no other content. Tags must be one word only and lowercase.  Suggest tags sparringly, do not treat them as keywords.",[{role:"user",content:`Given the note titled "${t}" with the content below, please provide tags.

${e}`}])).choices[0].message.content.trim().replace(/,/g,"").split(/\s+/),o=await y.parseMarkdown(e),s=await w(o),c=[...new Set([...s.tags||[],...n])];s.tags=c,console.log("Current frontmatter:",s);let l=await Q(o,s);console.log("updatedNoteContent",l),await a.dispatch(l),await a.flashNotification("Note tagged successfully.")}async function le(){let e=await M();await v({systemMessage:"You are an AI note assistant in a markdown-based note tool.",userMessage:e.text})}async function me(){let e=await re();if(e.length===0){await a.flashNotification("Error: The page does not match the required format for a chat.");return}let t=await T();await a.insertAtPos(`

**assistant**: `,t);let r=t+17;await a.insertAtPos(`

**user**: `,r),await a.moveCursor(r+12),await v(e,r)}async function pe(){try{let e=await a.prompt("Enter a prompt for DALL\xB7E:");if(!e||!e.trim()){await a.flashNotification("No prompt entered. Operation cancelled.","error");return}let t=await ee(e,1);if(t&&t.data&&t.data.length>0){let r=t.data[0].b64_json,n=t.data[0].revised_prompt,o=new Uint8Array(J(r)),s=`dall-e-${Date.now()}.png`,c=te(await a.getCurrentPage())+"/";c==="/"&&(c=""),await g.writeAttachment(c+s,o);let l=`![${s}](${s})
*${n}*`;await a.insertAtCursor(l),await a.flashNotification("Image generated and inserted with caption successfully.")}else await a.flashNotification("Failed to generate image.","error")}catch(e){console.error("Error generating image with DALL\xB7E:",e),await a.flashNotification("Error generating image.","error")}}async function ue(e,t){try{let r=[];return r.push({role:"user",content:e}),(await F(t||"You are an AI note assistant helping to render content for a note.  Please follow user instructions and keep your response short and concise.",r)).choices[0].message.content}catch(r){throw console.error("Error querying OpenAI:",r),r}}var L=class{constructor(t,r={}){this.maxSize=t;this.map=new Map(Object.entries(r))}map;set(t,r,n){let o={value:r,la:Date.now()};if(n){let s=this.map.get(t);s?.expTimer&&clearTimeout(s.expTimer),o.expTimer=setTimeout(()=>{this.map.delete(t)},n)}if(this.map.size>=this.maxSize){let s=this.getOldestKey();this.map.delete(s)}this.map.set(t,o)}get(t){let r=this.map.get(t);if(r)return r.la=Date.now(),r.value}remove(t){this.map.delete(t)}toJSON(){return Object.fromEntries(this.map.entries())}getOldestKey(){let t,r;for(let[n,o]of this.map.entries())(!r||o.la<r)&&(t=n,r=o.la);return t}};var de=new L(50);async function fe(e,t,r){if(!r)return t(e);let n=JSON.stringify(e),o=de.get(n);if(o)return o;let s=await t(e);return de.set(n,s,r*1e3),s}function ge(e,t,r){return fe(t,()=>H("index.queryObjects",e,t),r)}async function he(e,t={},r={}){try{let n=await y.parseMarkdown(e),o=await w(n,{removeFrontmatterSection:!0,removeTags:["template"]});e=P(n).trimStart();let s;return o.frontmatter&&(typeof o.frontmatter=="string"?s=o.frontmatter:s=await d.stringify(o.frontmatter),s=await E.renderTemplate(s,t,r)),{frontmatter:o,renderedFrontmatter:s,text:await E.renderTemplate(e,t,r)}}catch(n){throw console.error("Error rendering template",n),n}}async function ye(e){let t;if(!e||!e.templatePage){let m=await ge("template",{filter:["attr",["attr","aiprompt"],"description"]});t=await a.filterBox("Prompt Template",m.map(p=>{let f=p.ref.split("/").pop();return{...p,description:p.aiprompt.description||p.ref,name:p.aiprompt.displayName||f,systemPrompt:p.aiprompt.systemPrompt||"You are an AI note assistant. Please follow the prompt instructions.",insertAt:p.aiprompt.insertAt||"cursor"}}),"Select the template to use as the prompt.  The prompt will be rendered and sent to the LLM model.")}else{console.log("selectedTemplate from slash completion: ",e);let m=await g.readPage(e.templatePage),p=await y.parseMarkdown(m),{aiprompt:f}=await w(p);console.log("templatePage from slash completion: ",m),t={ref:e.templatePage,systemPrompt:f.systemPrompt||"You are an AI note assistant. Please follow the prompt instructions.",insertAt:f.insertAt||"cursor"}}if(!t){await a.flashNotification("No template selected");return}console.log("User selected prompt template: ",t);let r=["cursor","page-start","page-end"];if(!r.includes(t.insertAt)){console.error(`Invalid insertAt value: ${t.insertAt}. It must be one of ${r.join(", ")}`),await a.flashNotification(`Invalid insertAt value: ${t.insertAt}. Please select a valid option.`,"error");return}let n=await g.readPage(t.ref),o=await a.getCurrentPage(),s=await g.getPageMeta(o),c;switch(t.insertAt){case"page-start":c=0;break;case"page-end":c=await T();break;case"frontmatter":await a.flashNotification("rendering in frontmatter not supported yet","error");break;case"modal":break;case"cursor":default:c=await a.getCursor()}let l=await he(n,s,{page:s});await v({systemMessage:t.systemPrompt,userMessage:l.text},c)}var xe={queryOpenAI:ue,reloadConfig:ne,summarizeNote:ie,insertSummary:ae,callOpenAI:se,tagNoteWithAI:ce,promptAndGenerateImage:pe,streamOpenAIWithSelectionAsPrompt:le,streamChatOnPage:me,insertAiPromptFromTemplate:ye},Pe={name:"silverbullet-ai",requiredPermissions:["fetch"],functions:{queryOpenAI:{path:"sbai.ts:queryOpenAI"},reloadConfig:{path:"sbai.ts:reloadConfig",events:["page:saved"]},summarizeNote:{path:"sbai.ts:openSummaryPanel",command:{name:"AI: Summarize Note and open summary"}},insertSummary:{path:"sbai.ts:insertSummary",command:{name:"AI: Insert Summary"}},callOpenAI:{path:"sbai.ts:callOpenAIwithNote",command:{name:"AI: Call OpenAI with Note as context"}},tagNoteWithAI:{path:"sbai.ts:tagNoteWithAI",command:{name:"AI: Generate tags for note"}},promptAndGenerateImage:{path:"sbai.ts:promptAndGenerateImage",command:{name:"AI: Generate and insert image using DallE"}},streamOpenAIWithSelectionAsPrompt:{path:"sbai.ts:streamOpenAIWithSelectionAsPrompt",command:{name:"AI: Stream response with selection or note as prompt"}},streamChatOnPage:{path:"sbai.ts:streamChatOnPage",command:{name:"AI: Chat on current page",key:"Ctrl-Shift-Enter",mac:"Cmd-Shift-Enter"}},insertAiPromptFromTemplate:{path:"src/prompts.ts:insertAiPromptFromTemplate",command:{name:"AI: Execute AI Prompt from Custom Template"}}},assets:{}},qn={manifest:Pe,functionMapping:xe};_(xe,Pe);export{qn as plug};
