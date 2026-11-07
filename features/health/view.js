function createHealthView(React, { t, h, useApi, useTask, button, field, select, check, card, empty, Status, saveBlob, Sheet }) {
  return function HealthView({home,chat}) {
    const api = useApi("health"), task = useTask();
    const [people, setPeople] = React.useState([]), [personId, setPersonId] = React.useState(""), [data, setData] = React.useState(null), [query, setQuery] = React.useState(""), [table, setTable] = React.useState(true), [panel, setPanel] = React.useState(""), [editor, setEditor] = React.useState(null), [config, setConfig] = React.useState(null), [name, setName] = React.useState(""), [label, setLabel] = React.useState(""), [allFields, setAllFields] = React.useState(false), [menu,setMenu] = React.useState(false);
    async function load(id = personId) {
      const list = await api("/people");
      setPeople(list.people);
      const chosen = id || String(list.people[0]?.id || "");
      setPersonId(chosen);
      setData(chosen ? await api("/people/" + chosen) : null);
    }
    React.useEffect(() => {
      task.run(() => load(), "");
    }, [api]);
    const columns = data?.columns || [], records = (data?.records || []).filter((row) => !query || Object.values(row.cells).some((v) => String(v ?? "").toLowerCase().includes(query.toLowerCase()))).slice().reverse();
    const visible = columns.filter((c) => c.id === "c0" || data?.person.visible.includes(c.id)).filter((c) => c.id === "c0" || !data?.person.hideEmpty || records.some((r) => String(r.cells[c.id] ?? "").trim())).sort((a, b) => a.id === "c0" ? -1 : b.id === "c0" ? 1 : Number(data.person.focused.includes(b.id)) - Number(data.person.focused.includes(a.id)));
    const menuRef=React.useRef(null),moreRef=React.useRef(null),tableRef=React.useRef(null);
    React.useEffect(()=>{if(!menu)return;const outside=e=>{if(!menuRef.current?.contains(e.target))setMenu(false);},escape=e=>{if(e.key==='Escape'){setMenu(false);moreRef.current?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[menu]);
    React.useEffect(()=>{if(tableRef.current)tableRef.current.scrollTop=0;},[personId,query,table]);
    function action(fn){setMenu(false);moreRef.current?.focus();fn();}
    function edit(row) {
      setEditor(row ? { ...row, cells: { ...row.cells } } : { cells: { c0: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(/* @__PURE__ */ new Date()) } });
      setAllFields(false);
      setPanel("record");
    }
    function close() {
      if (task.busy) return;
      if ((panel === "record" || panel === "config") && !window.confirm("放弃本次未保存的修改？")) return;
      setPanel("");
      setEditor(null);
    }
    function save() {
      task.run(async () => {
        await api("/people/" + personId + "/records" + (editor.id ? "/" + editor.id : ""), editor.id ? "PUT" : "POST", { cells: editor.cells, revision: editor.revision });
        setPanel("");
        setEditor(null);
        await load();
      }, "记录已保存");
    }
    const recordFields = columns.filter((c) => allFields || ["c0", "c1"].includes(c.id) || data?.person.visible.includes(c.id) || String(editor?.cells[c.id] ?? "").trim());
    return h('div',{className:'pk-records-page pk-compact-content'},
      h('fieldset',{className:'pk-u-fieldset pk-compact-main',disabled:task.busy},
        h('div',{className:'pk-compact-toolbar'},button('首页',home),button('会话',chat),
          h('select',{'aria-label':'人员',value:personId,disabled:!people.length,onChange:e=>{setQuery('');task.run(()=>load(e.target.value),'');}},people.length?people.map(p=>h('option',{key:p.id,value:String(p.id)},p.name)):h('option',{value:''},'暂无人员')),
          button('新增',()=>edit(),!data,'primary'),
          h('div',{className:'pk-compact-more',ref:menuRef},h('button',{type:'button',ref:moreRef,'aria-expanded':menu,'aria-controls':'pk-health-more-actions',onClick:()=>setMenu(!menu)},'更多'),menu&&h('div',{id:'pk-health-more-actions',className:'pk-compact-menu'},
            button('显示字段',()=>action(()=>{setConfig({...data.person});setPanel('config');}),!data),button(table?'卡片视图':'表格视图',()=>action(()=>setTable(!table)),!data),button('管理',()=>action(()=>setPanel('manage'))),
            button('导出全部 Excel',()=>action(()=>task.run(async()=>saveBlob(await api('/people/'+personId+'/export?scope=all','GET',undefined,{blob:true}),'健康记录.xlsx'),'已生成导出文件')),!data),button('刷新记录',()=>action(()=>task.run(()=>load(),''))),h('p',null,'点日期或指标查看完整记录。仅保存原始记录，不提供诊断。')))),
        h('div',{className:'pk-compact-search'},h('input',{type:'search','aria-label':'搜索记录',placeholder:'搜索日期、来源、指标',value:query,onChange:e=>setQuery(e.target.value)}),h('span',{className:'pk-u-muted'},records.length+' 条')),
        !panel&&h(Status,{task}),
        data&&(!records.length?empty(query?'没有匹配的记录，可清空搜索重试。':'暂无记录，点击“新增”开始。'):table?
          h('div',{ref:tableRef,className:'pk-u-scroll pk-health-table pk-health-dense-table',tabIndex:0,'aria-label':'健康记录对比表格'},h('table',null,
            h('thead',null,h('tr',null,visible.map(c=>h('th',{key:c.id,scope:'col'},(data.person.focused.includes(c.id)?'★ ':'')+c.label)))),
            h('tbody',null,records.map(row=>h('tr',{key:row.id},visible.map(c=>h('td',{key:c.id},h('button',{type:'button',className:c.id==='c0'?'pk-health-value pk-date-button':'pk-health-value',onClick:()=>edit(row),'aria-label':c.id==='c0'?'编辑 '+row.cells.c0+' 的记录':'查看 '+row.cells.c0+' 的'+c.label},String(row.cells[c.id]??'').trim()||'—')))))))):
          h('div',{ref:tableRef,className:'pk-u-list pk-health-cards'},records.map(row=>h('article',{key:row.id,className:'pk-u-card'},h('div',{className:'pk-u-row pk-u-between'},h('h2',null,row.cells.c0),button('编辑记录',()=>edit(row))),h('div',{className:'pk-u-grid'},visible.filter(c=>c.id!=='c0').map(c=>h('div',{key:c.id},h('div',{className:'pk-u-muted'},c.label),h('div',{className:'pk-u-wrap'},String(row.cells[c.id]??'').trim()||'—')))))))),
        !data&&!task.busy&&button('添加人员',()=>setPanel('manage'),false,'primary')),
      panel && h(Sheet, { title: panel === "record" ? editor.id ? "编辑健康记录" : "新增健康记录" : panel === "config" ? "显示与关注" : "健康管理", onClose: close, busy: task.busy }, h(Status, { task }), h(
        "fieldset",
        { className: "pk-u-fieldset", disabled: task.busy },
        panel === "record" && h("form", { className: "pk-u-form", onSubmit: (e) => {
          e.preventDefault();
          save();
        } }, h("p", { className: "pk-u-muted" }, "先填写日期与需要的指标，其他字段可留空；未显示的原有内容会保留。"), h("div", { className: "pk-u-grid pk-health-editor-grid" }, recordFields.map((c) => h("label", { key: c.id }, c.label, c.id === "c0" ? h("input", { required: true, value: editor.cells.c0 || "", placeholder: "YYYY-MM-DD，也可填写年份", onChange: (e) => setEditor({ ...editor, cells: { ...editor.cells, c0: e.target.value } }) }) : h("textarea", { "aria-label": c.label, rows: 1, maxLength: 1e4, value: editor.cells[c.id] ?? "", onChange: (e) => setEditor({ ...editor, cells: { ...editor.cells, [c.id]: e.target.value } }) })))), button(allFields ? "收起其他字段" : "展开全部 " + columns.length + " 个字段", () => setAllFields(!allFields)), h("div", { className: "pk-u-sheet-footer" }, h("button", { type: "submit", className: "pk-u-primary" }, "保存记录"), button("取消", close), editor.id && button("删除记录", () => {
          if (window.confirm("永久删除这条健康记录？此操作不可撤销。")) task.run(async () => {
            await api("/people/" + personId + "/records/" + editor.id, "DELETE", { revision: editor.revision });
            await load();
            setPanel("");
            setEditor(null);
          }, "记录已删除");
        }, false, "danger"))),
        panel === "config" && h(
          "div",
          { className: "pk-u-form" },
          h("p", { className: "pk-u-muted" }, "日期始终显示。关注指标排在前面，不修改原始记录。"),
          check("隐藏空字段", config.hideEmpty, (v) => setConfig({ ...config, hideEmpty: v })),
          h("div", { className: "pk-health-columns" }, columns.map((c) => h("div", { key: c.id, className: "pk-u-row pk-u-between" }, check(c.label, c.id === "c0" || config.visible.includes(c.id), (v) => {
            if (c.id !== "c0") setConfig({ ...config, visible: v ? [...config.visible, c.id] : config.visible.filter((id) => id !== c.id) });
          }), check("关注 " + c.label, config.focused.includes(c.id), (v) => setConfig({ ...config, focused: v ? [...config.focused, c.id] : config.focused.filter((id) => id !== c.id) }))))),
          h("div", { className: "pk-u-sheet-footer" }, button("保存视图", () => task.run(async () => {
            await api("/people/" + personId + "/config", "PUT", { revision: config.revision, visible: [.../* @__PURE__ */ new Set(["c0", ...config.visible])], focused: config.focused, hideEmpty: config.hideEmpty });
            await load();
            setPanel("");
          }, "视图已保存"), false, "primary"), button("取消", close))
        ),
        panel === "manage" && h("div", { className: "pk-u-form" }, h("div", { className: "pk-u-actions" }, button("刷新记录", () => task.run(() => load(), "")), data && button("导出全部 Excel", () => task.run(async () => saveBlob(await api("/people/" + personId + "/export?scope=all", "GET", void 0, { blob: true }), "健康记录.xlsx"), "已生成导出文件"))), data && h("form", { className: "pk-u-form", onSubmit: (e) => {
          e.preventDefault();
          task.run(async () => {
            await api("/people/" + personId + "/columns", "POST", { label, revision: data.person.revision });
            setLabel("");
            await load();
          }, "字段已添加，可在新增或编辑记录中填写");
        } }, h("h3", null, "添加字段"), h("p", { className: "pk-u-muted" }, "仅添加到当前人员，自动显示；Agent 也可添加字段与记录。"), field("字段名称（可含单位）", label, setLabel, { required: true, maxLength: 80, placeholder: "例如：静息心率（次/分）" }), h("button", { type: "submit", disabled: !label.trim() }, "添加字段")), h("form", { className: "pk-u-form", onSubmit: (e) => {
          e.preventDefault();
          task.run(async () => {
            const result = await api("/people", "POST", { name });
            setName("");

            setQuery("");
            await load(String(result.person.id));
            setPanel("");
          }, "人员已添加");
        } }, h("h3", null, "添加人员"), field("姓名", name, setName, { required: true, maxLength: 40 }), h("button", { type: "submit", disabled: !name.trim() }, "添加人员")))
      ))
    );
  };
}
