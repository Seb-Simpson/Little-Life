import {test,expect} from '@playwright/test';
const jsonFile=data=>({name:'school-synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
const stamp='2026-11-16T10:00:00.000Z';
function exportData({sourceId='socs',coverage=true,items=null}={}){
  return {schemaVersion:2,sourceId,exportedAt:stamp,lastSuccessfulSyncAt:stamp,coverage:coverage?['lesson','activity'].map(category=>({category,start:'2026-11-16T00:00:00Z',end:'2026-11-24T00:00:00Z',completeness:'complete',observedAt:stamp})):[],items:items??[{externalId:'lesson-1',type:'event',category:'lesson',title:'SYNTHETIC · Physics',start:'2026-11-16T11:00:00Z',end:'2026-11-16T12:00:00Z',updatedAt:stamp}]};
}
test.beforeEach(async({page})=>{
  await page.clock.install({time:new Date('2026-11-16T10:30:00Z')});
});
async function personal(page){await page.goto('/');await page.getByRole('button',{name:'Use my data'}).click();await expect(page.getByText('My life · local workspace')).toBeVisible();}
async function importFile(page,data){await page.getByRole('link',{name:'Your data',exact:true}).click();await page.locator('#import-file').setInputFiles(jsonFile(data));await page.getByRole('button',{name:'Preview import',exact:true}).click();await page.getByRole('button',{name:'Import these records',exact:true}).click();await expect(page.getByRole('button',{name:'Import these records',exact:true})).toHaveCount(0);}
test('demo renders, navigation works, and mobile has no horizontal overflow',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await expect(page.getByRole('heading',{name:'Today’s timeline'})).toBeVisible();await expect(page.getByText('Demonstration workspace',{exact:true})).toBeVisible();
  for(const [link,title] of [['Tomorrow','Tomorrow’s schedule'],['Tasks & assignments','Assignments, tasks & reminders'],['Daily briefing','What do I have today?'],['Journal & goals','Daily journal'],['Integrations','From your existing flows to your day'],['Your data','Structured import']]){await page.getByRole('link',{name:link,exact:true}).click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();}
  await page.getByRole('link',{name:'My day',exact:true}).click();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'test-results/desktop-demo.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.getByRole('link',{name:'My day',exact:true}).click();await expect(page.getByRole('heading',{name:'Today’s timeline'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'test-results/mobile-demo.png',fullPage:true});expect(errors).toEqual([]);
});
test('manual events persist across reload and can be cancelled; navigation keeps data',async({page})=>{
  await personal(page);await page.getByRole('button',{name:'Add entry',exact:true}).click();
  await page.getByLabel('Title',{exact:true}).fill('SYNTHETIC · Dentist');await page.getByLabel('Date',{exact:true}).fill('2026-11-16');await page.getByLabel('Starts',{exact:true}).fill('15:00');await page.getByLabel('Ends',{exact:true}).fill('15:30');await page.getByRole('button',{name:'Save entry',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.getByRole('heading',{name:'SYNTHETIC · Dentist',exact:true}).first()).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'SYNTHETIC · Dentist',exact:true}).first()).toBeVisible();await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('cancelled');await page.getByRole('button',{name:'Save entry',exact:true}).click();
  await expect(page.locator('.timeline-row.cancelled')).toContainText('SYNTHETIC · Dentist');await page.getByRole('link',{name:'Daily briefing',exact:true}).click();await expect(page.locator('.briefing-answer').first()).not.toContainText('Dentist');
});
test('file import replay deduplicates, preserves missing deadlines and survives reload',async({page})=>{
  await personal(page);const data=exportData();await importFile(page,data);await importFile(page,data);
  await page.reload();await page.getByRole('link',{name:'My day',exact:true}).click();await expect(page.locator('.timeline-row').filter({hasText:'SYNTHETIC · Physics'})).toHaveCount(1);
  await expect(page.getByText('Free time is unknown. Required coverage or event details are missing.')).toBeVisible();
  await importFile(page,exportData({sourceId:'teams',coverage:false,items:[{externalId:'missing-due',type:'assignment',title:'SYNTHETIC · Essay without deadline',updatedAt:stamp}]}));
  await page.getByRole('link',{name:'Daily briefing',exact:true}).click();await expect(page.locator('.briefing-answer').filter({hasText:'deadline unavailable'})).not.toHaveCount(0);
});
test('invalid imports are atomic and do not erase prior records',async({page})=>{
  await personal(page);await importFile(page,exportData());await page.locator('#import-file').setInputFiles(jsonFile(exportData({items:[{externalId:'invalid',type:'event',title:'Missing update time'}]})));await page.getByRole('button',{name:'Preview import',exact:true}).click();
  await expect(page.locator('#import-result')).toContainText('updatedAt');await expect(page.getByRole('button',{name:'Import these records'})).toHaveCount(0);await page.reload();await page.getByRole('link',{name:'My day',exact:true}).click();await expect(page.locator('.timeline-row').filter({hasText:'SYNTHETIC · Physics'})).toHaveCount(1);
});
test('backups download and restore, and journal text is escaped',async({page})=>{
  await personal(page);await page.getByRole('button',{name:'Add entry',exact:true}).click();await page.getByRole('combobox',{name:'Type',exact:true}).selectOption('journal');await page.getByLabel('Title',{exact:true}).fill('<img src=x onerror=alert(1)>');await page.getByLabel('Notes optional',{exact:true}).fill('SYNTHETIC journal text');await page.getByRole('button',{name:'Save entry',exact:true}).click();await page.getByRole('link',{name:'Journal & goals',exact:true}).click();await expect(page.getByRole('heading',{name:'<img src=x onerror=alert(1)>'})).toBeVisible();expect(await page.locator('.journal-note img').count()).toBe(0);
  await page.getByRole('link',{name:'Your data',exact:true}).click();const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download backup',exact:true}).click();const download=await downloaded;const stream=await download.createReadStream();const chunks=[];for await(const c of stream)chunks.push(c);const backup=Buffer.concat(chunks);
  page.once('dialog',d=>d.accept());await page.locator('#restore-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:backup});await expect(page.getByRole('status')).toContainText('Backup restored locally');await page.reload();await page.getByRole('link',{name:'Journal & goals',exact:true}).click();await expect(page.getByRole('heading',{name:'<img src=x onerror=alert(1)>'})).toBeVisible();
});
test('shared-path origin rejects personal data and never loads a prior personal workspace',async({page})=>{
  // The app is intentionally served at /Little-Life/ as well as root in this fixture.
  await page.addInitScript(()=>{localStorage.setItem('little-life.mode','personal');localStorage.setItem('little-life.personal.v1','PRIVATE-LEGACY-SENTINEL');});
  await page.goto('/Little-Life/');await expect(page.getByRole('button',{name:'Use my data'})).toHaveCount(0);await expect(page.getByText('Demonstration workspace',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Add entry'})).toBeDisabled();await page.getByRole('link',{name:'Your data',exact:true}).click();await expect(page.locator('#import-file')).toBeDisabled();await expect(page.locator('#restore-file')).toBeDisabled();await expect(page.locator('body')).not.toContainText('PRIVATE-LEGACY-SENTINEL');
  expect(await page.evaluate(()=>localStorage.getItem('little-life.personal.v1'))).toBe('PRIVATE-LEGACY-SENTINEL');
});
test('linked native file handle survives reload and one-click refresh reads revised synthetic data',async({page})=>{
  const payload=exportData();
  await page.addInitScript(data=>{
    window.showOpenFilePicker=async()=>{
      const root=await navigator.storage.getDirectory(),file=await root.getFileHandle('socs.json',{create:true});
      const writer=await file.createWritable();await writer.write(JSON.stringify(data));await writer.close();return [file];
    };
  },payload);
  await personal(page);await page.getByRole('link',{name:'Integrations',exact:true}).click();await page.getByRole('button',{name:'Link and read SOCS file',exact:true}).click();await expect(page.locator('.linked-file').first()).toContainText('socs.json · granted');
  await page.reload();await expect(page.locator('.linked-file').first()).toContainText('socs.json · granted');
  await page.evaluate(async data=>{
    data.exportedAt='2026-11-16T10:20:00Z';data.items[0].title='SYNTHETIC · Revised Physics';data.items[0].updatedAt='2026-11-16T10:15:00Z';
    const root=await navigator.storage.getDirectory(),file=await root.getFileHandle('socs.json'),writer=await file.createWritable();await writer.write(JSON.stringify(data));await writer.close();
  },payload);
  await page.getByRole('button',{name:'Refresh linked files',exact:true}).click();await expect(page.getByRole('status')).toContainText('1 changed');await page.getByRole('link',{name:'My day',exact:true}).click();await expect(page.locator('.timeline-row').filter({hasText:'SYNTHETIC · Revised Physics'})).toHaveCount(1);
});
test('linked file with wrong source is rejected before its handle is remembered',async({page})=>{
  await page.addInitScript(data=>{window.showOpenFilePicker=async()=>{const root=await navigator.storage.getDirectory(),file=await root.getFileHandle('wrong.json',{create:true}),writer=await file.createWritable();await writer.write(JSON.stringify(data));await writer.close();return [file];};},exportData({sourceId:'teams'}));
  await personal(page);await page.getByRole('link',{name:'Integrations',exact:true}).click();await page.getByRole('button',{name:'Link and read SOCS file',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Wrong source');await expect(page.locator('.linked-file').first()).toContainText('No file linked');
});
test('auto refresh updates local files while visible without renewing old upstream observations',async({page})=>{
  const payload=exportData();await page.addInitScript(data=>{window.showOpenFilePicker=async()=>{const root=await navigator.storage.getDirectory(),file=await root.getFileHandle('socs.json',{create:true}),writer=await file.createWritable();await writer.write(JSON.stringify(data));await writer.close();return [file];};},payload);
  await personal(page);await page.getByRole('link',{name:'Integrations',exact:true}).click();await page.getByRole('button',{name:'Link and read SOCS file',exact:true}).click();await expect(page.locator('.linked-file').first()).toContainText('granted');
  await page.locator('#auto-refresh').check();await page.clock.fastForward(60000);await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('little-life.personal.v1')).sources.find(s=>s.id==='socs').lastImportAt.slice(0,16))).toBe('2026-11-16T10:31');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('little-life.personal.v1')).sources.find(s=>s.id==='socs').coverage[0].observedAt)).toBe('2026-11-16T10:00:00.000Z');
});
test('keyboard opens and closes the entry dialog with focus returned',async({page})=>{
  await personal(page);const button=page.getByRole('button',{name:'Add entry',exact:true});await button.focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(button).toBeFocused();
});
test('public build blocks personal inputs even when served at localhost root',async({page})=>{
  test.skip(Boolean(process.env.LITTLE_LIFE_TEST_URL),'Built artifact test needs the local dist fixture.');
  await page.goto('http://127.0.0.1:5174/');await expect(page.getByRole('button',{name:'Use my data'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Add entry'})).toBeDisabled();await page.getByRole('link',{name:'Integrations',exact:true}).click();await expect(page.getByRole('button',{name:'Link and read SOCS file'})).toBeDisabled();await expect(page.getByText('This is a synthetic-only deployment.')).toBeVisible();
  await page.goto('http://127.0.0.1:5174/Little-Life/');await expect(page.getByRole('heading',{name:'Today’s timeline'})).toBeVisible();await page.getByRole('link',{name:'Daily briefing',exact:true}).click();await expect(page.getByRole('heading',{name:'What is my next lesson?'})).toBeVisible();
});
test('revoked linked-file read permission leaves existing records intact',async({page})=>{
  await page.addInitScript(data=>{
    const original=FileSystemHandle.prototype.queryPermission;
    FileSystemHandle.prototype.queryPermission=function(options){return window.simulateRevocation?Promise.resolve('prompt'):original.call(this,options);};
    window.showOpenFilePicker=async()=>{const root=await navigator.storage.getDirectory(),file=await root.getFileHandle('socs.json',{create:true}),writer=await file.createWritable();await writer.write(JSON.stringify(data));await writer.close();return [file];};
  },exportData());
  await personal(page);await page.getByRole('link',{name:'Integrations',exact:true}).click();await page.getByRole('button',{name:'Link and read SOCS file',exact:true}).click();await expect(page.locator('.linked-file').first()).toContainText('granted');await page.evaluate(()=>{window.simulateRevocation=true;});await page.getByRole('button',{name:'Refresh linked files',exact:true}).click();await expect(page.getByRole('alert')).toContainText('File read permission is needed');await page.getByRole('link',{name:'My day',exact:true}).click();await expect(page.locator('.timeline-row').filter({hasText:'SYNTHETIC · Physics'})).toHaveCount(1);
});
