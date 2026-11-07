throw new Error('Disabled after 1.5.0 web boot failure: do not apply the dedicated renderer bridge.');
// Additive native-renderer adapter + presentation-only filtering of the reserved Session.
// Exact source anchors fail closed; no session files, personal lists or profile config are edited.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=process.argv[2];if(!root||!path.isAbsolute(root))throw Error('Pass inspected DSH node_modules/@deepseek-ai directory');
const backups=new URL('../../.local/terminal-touch-bridge/',import.meta.url);await mkdir(backups,{recursive:true,mode:0o700});
const hash=s=>createHash('sha256').update(s).digest('hex');
async function patch(name,marker,change){const target=path.join(root,name,'lib/client.js'),original=await readFile(target,'utf8');if(original.includes(marker)){console.log(name+': already patched');return;}const updated=change(original);if(updated===original)throw Error('No change for '+name);await writeFile(new URL(name+'.'+hash(original)+'.original',backups),original,{mode:0o600,flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});await writeFile(target,updated);console.log(name+': native extension rebuilt');}
function once(source,from,to){if(source.split(from).length!==2)throw Error('Unsupported installed DSH artifact: '+from.slice(0,70));return source.replace(from,()=>to);}
await patch('dsh-client-ui-sidebar-terminal','pocket-kit.dedicated-native-renderer.v1',source=>{
 const marker='\t\t\tctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab.title",';
 const addition=`
            // pocket-kit.dedicated-native-renderer.v1
            ctx.slots.inject("local.terminal.dedicated.body",()=>ctx.slots.register({
                name:"local.terminal.dedicated.body",locale:namespace,
                children:{"local.terminal.touch.keys":{kind:"list",scope:"session"}},
                inject:(sessionId)=>{
                    const key="pocket-kit-home-terminal";
                    const contentId="pocket-kit-native-home-terminal-v1";
                    const resolve=()=>ctx.webTerminals.view(sessionId,key,contentId);
                    return {
                        view:()=>resolve(),
                        hooks:{theme},
                        keyedHooks:{terminal:()=>resolve().state},
                        restart:()=>{ctx.webTerminals.close(sessionId,key,contentId);}
                    };
                }
            },props=>{
                const [revision,setRevision]=react.useState(0);
                const tabInfo=react.useCallback(()=>({tab:{id:"pocket-kit-home-terminal",visible:props.visible,actions:{openTab:()=>{props.restart();setRevision(n=>n+1);}}}}),[props.visible,props.restart]);
                return react.createElement("div",{style:{height:"100%",minHeight:0,display:"flex",flexDirection:"column"}},react.createElement(LazyTerminalBody,{...props,key:revision,useTabInfo:tabInfo}));
            }));
`;
 return once(source,marker,addition+marker);
});
await patch('dsh-client-ui-workspace','pocket-kit.hide-terminal-session.v1',source=>{
 // Both normal/archived browsing and search consume the same filtered local projection. The underlying Session remains available to native terminal APIs.
 const helper=`
        // pocket-kit.hide-terminal-session.v1
        function pocketTerminalList(state){
            const hidden="pocket-kit-terminal-home-v1";
            if(!state.ids.includes(hidden))return state;
            const byId={...state.byId};delete byId[hidden];
            return {...state,ids:state.ids.filter(id=>id!==hidden),byId};
        }
`;
 source=once(source,'\t\tfunction sessionVisible(session, current, archived, archivedFilter) {',helper+'\t\tfunction sessionVisible(session, current, archived, archivedFilter) {\n            if(session.id==="pocket-kit-terminal-home-v1")return false;');
 source=once(source,'const list = useSessions((state) => state);','const list = useSessions((state) => pocketTerminalList(state));');
 source=once(source,'const list = useSessions((s) => s);','const list = useSessions((s) => pocketTerminalList(s));');
 return source;
});
