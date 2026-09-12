import { useEffect, useState } from "react";
import { Save, ShieldCheck, Bell, Palette } from "lucide-react";

export default function Settings(){
  const [saved,setSaved]=useState(false);
  const [compact,setCompact]=useState(false);
  const [notifications,setNotifications]=useState(true);
  useEffect(()=>{setCompact(localStorage.getItem('yn_compact')==='1');setNotifications(localStorage.getItem('yn_notifications')!=='0')},[]);
  const save=()=>{localStorage.setItem('yn_compact',compact?'1':'0');localStorage.setItem('yn_notifications',notifications?'1':'0');setSaved(true);setTimeout(()=>setSaved(false),1800)};
  return <div className="page-content"><div className="page-heading"><div><p className="eyebrow">SYSTEM</p><h1>Settings</h1><p>Control your workspace experience.</p></div><button className="primary-button" onClick={save}><Save size={17}/> {saved?'Saved':'Save changes'}</button></div><div className="settings-grid"><section className="settings-card"><div className="settings-icon"><Palette size={19}/></div><div><h2>Workspace</h2><p>Keep the admin interface comfortable on any screen.</p></div><label><span>Compact tables</span><input type="checkbox" checked={compact} onChange={e=>setCompact(e.target.checked)}/></label></section><section className="settings-card"><div className="settings-icon"><Bell size={19}/></div><div><h2>Notifications</h2><p>Enable notification indicators in the admin header.</p></div><label><span>Notifications</span><input type="checkbox" checked={notifications} onChange={e=>setNotifications(e.target.checked)}/></label></section><section className="settings-card"><div className="settings-icon"><ShieldCheck size={19}/></div><div><h2>Security</h2><p>Authentication is handled by the YN Studio API.</p></div><strong className="security-state">Protected</strong></section></div></div>
}
