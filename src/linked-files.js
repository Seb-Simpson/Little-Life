// Read-only selected-file transport. No URL fetching, directory access or school login.
export function handleStore(indexedDB) {
  const dbName='little-life-linked-files-v1';
  async function open() {
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(dbName,1);
      request.onupgradeneeded=()=>request.result.createObjectStore('handles');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
  }
  async function operation(mode, callback) {
    const db=await open();
    try {
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction('handles',mode),request=callback(tx.objectStore('handles'));let result;
        request.onsuccess=()=>{result=request.result;};
        tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('Handle storage transaction aborted.'));
      });
    } finally {db.close();}
  }
  return { get:id=>operation('readonly',s=>s.get(id)), set:(id,handle)=>operation('readwrite',s=>s.put(handle,id)), delete:id=>operation('readwrite',s=>s.delete(id)) };
}
export function linkedFileConnector({ guard, store, picker }) {
  const handles=new Map();
  const known=id=>{if(!['socs','teams'].includes(id))throw new Error('Choose SOCS or Teams.');};
  return {
    supported:typeof picker==='function',
    async restore() {guard();for(const id of ['socs','teams']){const handle=await store.get(id);if(handle)handles.set(id,handle);}return this.status();},
    async status() {
      guard();const status=[];
      for(const id of ['socs','teams']){const handle=handles.get(id);let permission='unlinked';if(handle){try{permission=await handle.queryPermission({mode:'read'});}catch{permission='unavailable';}}status.push({sourceId:id,name:handle?.name??null,permission});}
      return status;
    },
    async choose(id) {
      guard();known(id);if(!picker)throw new Error('Linked-file refresh needs a supported Edge or Chrome browser. Manual file import remains available.');
      const [handle]=await picker({id:`little-life-${id}`,multiple:false,excludeAcceptAllOption:true,types:[{description:'Little Life JSON export',accept:{'application/json':['.json']}}]});
      if(!handle)throw new Error('No file selected.');
      // Persist only after a successful read and source validation via accept().
      return {handle,sourceId:id};
    },
    async accept(id,handle) {guard();known(id);await store.set(id,handle);handles.set(id,handle);},
    async reconnect(id) {guard();known(id);const h=handles.get(id);if(!h)throw new Error('Choose a file first.');const result=await h.requestPermission({mode:'read'});if(result!=='granted')throw new Error('Read access was not granted. Ask school IT if policy blocks it.');},
    async read(id, candidate = null) {
      guard();known(id);const handle=candidate??handles.get(id);if(!handle)throw new Error('No file linked. Choose the approved OneDrive export.');
      const permission=await handle.queryPermission({mode:'read'});
      if(permission!=='granted')throw new Error('File read permission is needed. Click Reconnect; do not change school restrictions.');
      let file;try{file=await handle.getFile();}catch{throw new Error('The linked file is unavailable. Check OneDrive sync, then choose the file again if it was replaced.');}
      if(file.size>2_000_000)throw new Error('File limit is 2 MB.');
      return file.text();
    },
    async forget(id) {guard();known(id);await store.delete(id);handles.delete(id);},
  };
}
