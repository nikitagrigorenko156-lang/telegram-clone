import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

const SERVER = 'https://telegram-clone-5x39.onrender.com';
const STICKERS = ['😂','❤️','🔥','👍','😮','😢','🎉','💯'];
const AVATARS = ['👤','😎','🦊','🐱','🐶','🦁','🐸','🤖','👻','🎃'];
const GROUP_ICONS = ['👥','🎮','📚','🎵','💼','⚽','🍕','✈️'];

let socket;

export default function App() {
  const saved = JSON.parse(localStorage.getItem('tguser')||'null');
  const [screen, setScreen] = useState(saved?'chats':'auth');
  const [authTab, setAuthTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState('👤');
  const [token, setToken] = useState(saved?.token||null);
  const [user, setUser] = useState(saved?.user||null);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [searchQ, setSearchQ] = useState('');
  const [searchRes, setSearchRes] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [activeInfo, setActiveInfo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [showStickers, setShowStickers] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupIcon, setGroupIcon] = useState('👥');
  const [groupMembers, setGroupMembers] = useState([]);
  const [typing, setTyping] = useState('');
  const [tab, setTab] = useState('chats');
  const [theme, setTheme] = useState('dark');
  const bottomRef = useRef();
  const typingRef = useRef();

  const bg = theme==='dark'?'#0e1621':'#f0f2f5';
  const card = theme==='dark'?'#17212b':'#ffffff';
  const text = theme==='dark'?'#fff':'#000';
  const sub = theme==='dark'?'#6b7f94':'#999';
  const accent = '#5288c1';
  const bubble1 = theme==='dark'?'#2b5278':'#d9fdd3';
  const bubble2 = theme==='dark'?'#182533':'#fff';

  useEffect(() => {
    if (saved?.token) { initSocket(saved.token); loadAll(saved.token); }
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:'smooth'}); }, [messages]);

  useEffect(() => {
    if (!searchQ.trim()) { setSearchRes([]); return; }
    const t = setTimeout(async () => {
      const r = await axios.get(`${SERVER}/search/${searchQ}`, {headers:{Authorization:'Bearer '+token}});
      setSearchRes(r.data);
    }, 400);
    return () => clearTimeout(t);
  }, [searchQ]);

  const saveSession = (tk, u) => localStorage.setItem('tguser', JSON.stringify({token:tk, user:u}));
  const logout = () => { localStorage.removeItem('tguser'); setToken(null); setUser(null); setScreen('auth'); if(socket) socket.disconnect(); };

  const register = async () => {
    try {
      const r = await axios.post(SERVER+'/register', {username, password, avatar});
      saveSession(r.data.token, r.data.user);
      setToken(r.data.token); setUser(r.data.user);
      initSocket(r.data.token); loadAll(r.data.token); setScreen('chats');
    } catch(e) { setError(e.response?.data?.error||'Ошибка'); }
  };

  const login = async () => {
    try {
      const r = await axios.post(SERVER+'/login', {username, password});
      saveSession(r.data.token, r.data.user);
      setToken(r.data.token); setUser(r.data.user);
      initSocket(r.data.token); loadAll(r.data.token); setScreen('chats');
    } catch(e) { setError(e.response?.data?.error||'Ошибка'); }
  };

  const initSocket = (tk) => {
    socket = io(SERVER);
    socket.on('connect', () => socket.emit('online', JSON.parse(localStorage.getItem('tguser'))?.user?.username));
    socket.on('message', msg => setMessages(p=>[...p, msg]));
    socket.on('reaction', data => {});
    socket.on('typing', data => {
      setTyping(data.from+' печатает...');
      clearTimeout(typingRef.current);
      typingRef.current = setTimeout(()=>setTyping(''), 2000);
    });
    socket.on('userOnline', uname => setUsers(p=>p.map(u=>u.username===uname?{...u,online:true}:u)));
    socket.on('userOffline', uname => setUsers(p=>p.map(u=>u.username===uname?{...u,online:false}:u)));
  };

  const loadAll = async (tk) => {
    const [ur, gr] = await Promise.all([
      axios.get(SERVER+'/users', {headers:{Authorization:'Bearer '+tk}}),
      axios.get(SERVER+'/groups', {headers:{Authorization:'Bearer '+tk}})
    ]);
    setUsers(ur.data); setGroups(gr.data);
  };

  const openChat = async (u) => {
    const room = [user.username, u.username].sort().join('_');
    setActiveRoom(room); setActiveInfo({...u, type:'user'});
    socket.emit('join', room);
    const r = await axios.get(SERVER+'/messages/'+room, {headers:{Authorization:'Bearer '+token}});
    setMessages(r.data.map(m=>({...m, from:m.from_user, id:m.created_at+m.id})));
    setScreen('chat'); setSearchQ(''); setSearchRes([]);
  };

  const openGroup = async (g) => {
    const room = 'group_'+g.id;
    setActiveRoom(room); setActiveInfo({...g, type:'group'});
    socket.emit('join', room);
    const r = await axios.get(SERVER+'/messages/'+room, {headers:{Authorization:'Bearer '+token}});
    setMessages(r.data.map(m=>({...m, from:m.from_user, id:m.created_at+m.id})));
    setScreen('chat');
  };

  const createGroup = async () => {
    if (!groupName.trim()) return;
    const r = await axios.post(SERVER+'/groups', {name:groupName, icon:groupIcon, members:groupMembers}, {headers:{Authorization:'Bearer '+token}});
    setGroups(p=>[...p, r.data]);
    setShowNewGroup(false); setGroupName(''); setGroupMembers([]);
    openGroup(r.data);
  };

  const sendMessage = () => {
    if (!input.trim()) return;
    socket.emit('message', {room:activeRoom, text:input, from:user.username, id:Date.now(), type:'text'});
    setInput('');
  };

  const handleTyping = (e) => {
    setInput(e.target.value);
    socket.emit('typing', {room:activeRoom, from:user.username});
  };

  const sendSticker = (e) => {
    socket.emit('message', {room:activeRoom, text:e, from:user.username, id:Date.now(), type:'sticker'});
    setShowStickers(false);
  };

  const s = {
    screen:{background:bg,minHeight:'100vh',color:text,fontFamily:'sans-serif',display:'flex',flexDirection:'column'},
    header:{background:card,padding:'12px 16px',display:'flex',alignItems:'center',gap:10,boxShadow:'0 1px 3px rgba(0,0,0,0.2)'},
    inp:{width:'100%',background:theme==='dark'?'#242f3d':'#f0f2f5',border:'none',borderRadius:10,padding:'10px 14px',color:text,fontSize:'1rem',outline:'none',marginBottom:12,boxSizing:'border-box'},
    btn:{width:'100%',background:accent,border:'none',borderRadius:10,padding:'12px',color:'#fff',fontSize:'1rem',fontWeight:'bold',cursor:'pointer'},
    listItem:{display:'flex',alignItems:'center',padding:'12px 16px',borderBottom:`1px solid ${theme==='dark'?'#17212b':'#eee'}`,cursor:'pointer',gap:12},
    messages:{flex:1,overflowY:'auto',padding:'12px',display:'flex',flexDirection:'column',gap:8},
    inputBar:{background:card,padding:'8px 12px',display:'flex',alignItems:'center',gap:8,position:'relative'},
    msgInput:{flex:1,background:theme==='dark'?'#242f3d':'#f0f2f5',border:'none',borderRadius:20,padding:'8px 14px',color:text,fontSize:'1rem',outline:'none'},
    iconBtn:{background:'none',border:'none',fontSize:'1.4rem',cursor:'pointer'},
    sendBtn:{background:accent,border:'none',borderRadius:'50%',width:36,height:36,color:'#fff',cursor:'pointer',fontSize:'1.1rem'},
    stickerPicker:{position:'absolute',bottom:60,left:12,background:card,borderRadius:12,padding:8,display:'flex',gap:8,flexWrap:'wrap',width:220,boxShadow:'0 4px 20px rgba(0,0,0,0.3)'},
    tabs:{display:'flex',background:card,borderBottom:`1px solid ${theme==='dark'?'#293748':'#eee'}`},
    tab:(a)=>({flex:1,padding:'10px',background:'none',border:'none',color:a?accent:sub,cursor:'pointer',borderBottom:a?`2px solid ${accent}`:'none',fontWeight:a?'bold':'normal'}),
    searchBar:{padding:'8px 16px',background:card},
    searchInp:{width:'100%',background:theme==='dark'?'#242f3d':'#f0f2f5',border:'none',borderRadius:20,padding:'8px 14px',color:text,fontSize:'0.95rem',outline:'none',boxSizing:'border-box'},
  };

  if (screen==='auth') return (
    <div style={s.screen}>
      <div style={{...s.header,justifyContent:'center'}}>
        <span style={{fontSize:'1.3rem',fontWeight:'bold',color:accent}}>✈️ TeleClone</span>
      </div>
      <div style={{background:card,borderRadius:16,padding:24,margin:24}}>
        <div style={{fontSize:'1.5rem',fontWeight:'bold',color:accent,marginBottom:16,textAlign:'center'}}>{authTab==='login'?'Войти':'Регистрация'}</div>
        <div style={{display:'flex',marginBottom:16,borderRadius:8,overflow:'hidden'}}>
          <button style={{flex:1,padding:'10px',background:authTab==='login'?accent:'#242f3d',border:'none',color:'#fff',cursor:'pointer'}} onClick={()=>{setAuthTab('login');setError('');}}>Войти</button>
          <button style={{flex:1,padding:'10px',background:authTab==='reg'?accent:'#242f3d',border:'none',color:'#fff',cursor:'pointer'}} onClick={()=>{setAuthTab('reg');setError('');}}>Регистрация</button>
        </div>
        {error&&<div style={{color:'#e53935',textAlign:'center',marginBottom:8}}>{error}</div>}
        <input style={s.inp} placeholder="Никнейм" value={username} onChange={e=>setUsername(e.target.value)}/>
        <input style={s.inp} placeholder="Пароль" type="password" value={password} onChange={e=>setPassword(e.target.value)}/>
        {authTab==='reg'&&<>
          <div style={{marginBottom:8,color:sub}}>Выбери аватар:</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:8,justifyContent:'center',marginBottom:12}}>
            {AVATARS.map(a=><button key={a} style={{fontSize:'1.8rem',background:avatar===a?accent:'#242f3d',border:'none',borderRadius:8,padding:'4px 8px',cursor:'pointer'}} onClick={()=>setAvatar(a)}>{a}</button>)}
          </div>
        </>}
        <button style={s.btn} onClick={authTab==='login'?login:register}>{authTab==='login'?'Войти':'Создать аккаунт'}</button>
      </div>
    </div>
  );

  if (screen==='chats') return (
    <div style={s.screen}>
      <div style={s.header}>
        <span style={{fontSize:'1.5rem'}}>{user?.avatar}</span>
        <span style={{fontWeight:'bold',flex:1,color:text}}>{user?.username}</span>
        <button style={{...s.iconBtn}} onClick={()=>setTheme(t=>t==='dark'?'light':'dark')}>{theme==='dark'?'☀️':'🌙'}</button>
        <button style={{...s.iconBtn,fontSize:'1rem',color:accent}} onClick={logout}>Выйти</button>
      </div>
      <div style={s.searchBar}>
        <input style={s.searchInp} placeholder="🔍 Поиск пользователей..." value={searchQ} onChange={e=>setSearchQ(e.target.value)}/>
      </div>
      {searchRes.length>0&&(
        <div style={{background:card,borderBottom:`1px solid ${theme==='dark'?'#293748':'#eee'}`}}>
          {searchRes.map(u=>(
            <div key={u.id} style={s.listItem} onClick={()=>openChat(u)}>
              <span style={{fontSize:'2rem'}}>{u.avatar}</span>
              <div>
                <div style={{fontWeight:'bold',color:text}}>{u.username}</div>
                <div style={{color:u.online?'#4caf50':sub,fontSize:'0.8rem'}}>{u.online?'🟢 онлайн':'офлайн'}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={s.tabs}>
        <button style={s.tab(tab==='chats')} onClick={()=>setTab('chats')}>💬 Чаты</button>
        <button style={s.tab(tab==='groups')} onClick={()=>setTab('groups')}>👥 Группы</button>
      </div>
      <div style={{flex:1,overflowY:'auto'}}>
        {tab==='chats'&&<>
          {users.length===0&&<div style={{textAlign:'center',color:sub,padding:32}}>Нет пользователей</div>}
          {users.map(u=>(
            <div key={u.id} style={s.listItem} onClick={()=>openChat(u)}>
              <div style={{position:'relative'}}>
                <span style={{fontSize:'2rem'}}>{u.avatar}</span>
                {u.online&&<span style={{position:'absolute',bottom:0,right:0,width:10,height:10,background:'#4caf50',borderRadius:'50%',border:`2px solid ${card}`}}/>}
              </div>
              <div>
                <div style={{fontWeight:'bold',color:text}}>{u.username}</div>
                <div style={{color:sub,fontSize:'0.8rem'}}>{u.online?'🟢 онлайн':'офлайн'}</div>
              </div>
            </div>
          ))}
        </>}
        {tab==='groups'&&<>
          <div style={{padding:'12px 16px'}}>
            <button style={{...s.btn,marginBottom:0}} onClick={()=>setShowNewGroup(true)}>+ Создать группу</button>
          </div>
          {groups.map(g=>(
            <div key={g.id} style={s.listItem} onClick={()=>openGroup(g)}>
              <span style={{fontSize:'2rem'}}>{g.icon}</span>
              <div><div style={{fontWeight:'bold',color:text}}>{g.name}</div><div style={{color:sub,fontSize:'0.8rem'}}>Группа</div></div>
            </div>
          ))}
        </>}
      </div>
      {showNewGroup&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
          <div style={{background:card,borderRadius:16,padding:24,width:'85%',maxWidth:400}}>
            <div style={{fontWeight:'bold',fontSize:'1.1rem',marginBottom:16,color:text}}>Новая группа</div>
            <input style={s.inp} placeholder="Название группы" value={groupName} onChange={e=>setGroupName(e.target.value)}/>
            <div style={{marginBottom:8,color:sub}}>Иконка:</div>
            <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
              {GROUP_ICONS.map(i=><button key={i} style={{fontSize:'1.5rem',background:groupIcon===i?accent:'#242f3d',border:'none',borderRadius:8,padding:'4px 8px',cursor:'pointer'}} onClick={()=>setGroupIcon(i)}>{i}</button>)}
            </div>
            <div style={{marginBottom:8,color:sub}}>Добавить участников:</div>
            {users.map(u=>(
              <div key={u.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',cursor:'pointer'}} onClick={()=>setGroupMembers(p=>p.includes(u.username)?p.filter(x=>x!==u.username):[...p,u.username])}>
                <span style={{fontSize:'1.4rem'}}>{u.avatar}</span>
                <span style={{color:text}}>{u.username}</span>
                <span style={{marginLeft:'auto'}}>{groupMembers.includes(u.username)?'✅':'⬜'}</span>
              </div>
            ))}
            <div style={{display:'flex',gap:8,marginTop:16}}>
              <button style={{...s.btn,background:'#555'}} onClick={()=>setShowNewGroup(false)}>Отмена</button>
              <button style={s.btn} onClick={createGroup}>Создать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={s.screen}>
      <div style={s.header}>
        <button style={{...s.iconBtn,color:accent,fontSize:'1.4rem'}} onClick={()=>setScreen('chats')}>←</button>
        <span style={{fontSize:'1.5rem'}}>{activeInfo?.avatar||activeInfo?.icon}</span>
        <div style={{flex:1}}>
          <div style={{fontWeight:'bold',color:text}}>{activeInfo?.name||activeInfo?.username}</div>
          {typing?<div style={{fontSize:'0.75rem',color:accent}}>{typing}</div>:
          activeInfo?.type==='user'?<div style={{fontSize:'0.75rem',color:activeInfo?.online?'#4caf50':sub}}>{activeInfo?.online?'онлайн':'офлайн'}</div>:
          <div style={{fontSize:'0.75rem',color:sub}}>группа</div>}
        </div>
      </div>
      <div style={s.messages}>
        {messages.map((msg,i)=>{
          const mine = msg.from===user.username;
          return (
            <div key={msg.id||i} style={{display:'flex',flexDirection:'column',alignItems:mine?'flex-end':'flex-start'}}>
              <div style={{maxWidth:'75%',padding:'8px 12px',borderRadius:mine?'16px 16px 4px 16px':'16px 16px 16px 4px',background:mine?bubble1:bubble2,fontSize:msg.type==='sticker'?'2.5rem':'1rem',boxShadow:'0 1px 2px rgba(0,0,0,0.2)'}}>
                {!mine&&activeInfo?.type==='group'&&<div style={{fontSize:'0.75rem',color:accent,fontWeight:'bold',marginBottom:2}}>{msg.from}</div>}
                {msg.type==='voice'?<span style={{color:accent}}>🎤 ▶ ━━━━━ 0:03</span>:msg.text}
                <div style={{fontSize:'0.65rem',color:sub,marginTop:4,textAlign:'right'}}>
                  {new Date(typeof msg.id==='number'?msg.id:Date.now()).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                  {mine&&' ✓✓'}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef}/>
      </div>
      <div style={s.inputBar}>
        <button style={s.iconBtn} onClick={()=>setShowStickers(p=>!p)}>😊</button>
        {showStickers&&(
          <div style={s.stickerPicker}>
            {STICKERS.map(e=><span key={e} style={{fontSize:'1.8rem',cursor:'pointer'}} onClick={()=>sendSticker(e)}>{e}</span>)}
          </div>
        )}
        <input style={s.msgInput} value={input} onChange={handleTyping} onKeyDown={e=>e.key==='Enter'&&sendMessage()} placeholder="Сообщение..."/>
        <button style={s.iconBtn} onClick={()=>socket.emit('message',{room:activeRoom,text:'🎤 Голосовое',from:user.username,id:Date.now(),type:'voice'})}>🎤</button>
        <button style={s.sendBtn} onClick={sendMessage}>➤</button>
      </div>
    </div>
  );
}
