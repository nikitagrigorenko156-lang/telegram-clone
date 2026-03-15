import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

const SERVER = 'https://telegram-clone-5x39.onrender.com';
const STICKERS = ['😂','❤️','🔥','👍','😮','😢','🎉','💯'];
const AVATARS = ['👤','😎','🦊','🐱','🐶','🦁','🐸','🤖','👻','🎃'];

let socket;

export default function App() {
  const saved = JSON.parse(localStorage.getItem('tguser') || 'null');
  const [screen, setScreen] = useState(saved ? 'chats' : 'auth');
  const [authTab, setAuthTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState('👤');
  const [token, setToken] = useState(saved?.token || null);
  const [user, setUser] = useState(saved?.user || null);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [activeUser, setActiveUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [showStickers, setShowStickers] = useState(false);
  const [reactions, setReactions] = useState({});
  const bottomRef = useRef();

  useEffect(() => {
    if (saved?.token) {
      initSocket(saved.token);
      loadUsers(saved.token);
    }
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:'smooth'}); }, [messages]);

  const saveSession = (tk, u) => {
    localStorage.setItem('tguser', JSON.stringify({token: tk, user: u}));
  };

  const logout = () => {
    localStorage.removeItem('tguser');
    setToken(null); setUser(null);
    setScreen('auth');
    if (socket) socket.disconnect();
  };

  const register = async () => {
    try {
      const r = await axios.post(SERVER+'/register', {username, password, avatar});
      saveSession(r.data.token, r.data.user);
      setToken(r.data.token); setUser(r.data.user);
      initSocket(r.data.token);
      loadUsers(r.data.token);
      setScreen('chats');
    } catch(e) { setError(e.response?.data?.error || 'Ошибка'); }
  };

  const login = async () => {
    try {
      const r = await axios.post(SERVER+'/login', {username, password});
      saveSession(r.data.token, r.data.user);
      setToken(r.data.token); setUser(r.data.user);
      initSocket(r.data.token);
      loadUsers(r.data.token);
      setScreen('chats');
    } catch(e) { setError(e.response?.data?.error || 'Ошибка'); }
  };

  const initSocket = (tk) => {
    socket = io(SERVER);
    socket.on('message', msg => setMessages(p => [...p, msg]));
    socket.on('reaction', data => setReactions(p => ({...p, [data.msgId]: [...(p[data.msgId]||[]), data.emoji]})));
  };

  const loadUsers = async (tk) => {
    const r = await axios.get(SERVER+'/users', {headers:{Authorization:'Bearer '+tk}});
    setUsers(r.data);
  };

  const openChat = async (u) => {
    const room = [user.username, u.username].sort().join('_');
    setActiveRoom(room); setActiveUser(u);
    socket.emit('join', room);
    const r = await axios.get(SERVER+'/messages/'+room, {headers:{Authorization:'Bearer '+token}});
    setMessages(r.data.map(m => ({...m, from: m.from_user, id: m.id})));
    setScreen('chat');
  };

  const sendMessage = () => {
    if (!input.trim()) return;
    socket.emit('message', {room:activeRoom, text:input, from:user.username, id:Date.now(), type:'text'});
    setInput('');
  };

  const sendSticker = (e) => {
    socket.emit('message', {room:activeRoom, text:e, from:user.username, id:Date.now(), type:'sticker'});
    setShowStickers(false);
  };

  const sendVoice = () => {
    socket.emit('message', {room:activeRoom, text:'🎤 Голосовое', from:user.username, id:Date.now(), type:'voice'});
  };

  const s = {
    screen:{background:'#0e1621',minHeight:'100vh',color:'#fff',fontFamily:'sans-serif',display:'flex',flexDirection:'column'},
    header:{background:'#17212b',padding:'12px 16px',display:'flex',alignItems:'center',gap:10},
    back:{background:'none',border:'none',color:'#5288c1',fontSize:'1.4rem',cursor:'pointer'},
    card:{background:'#17212b',borderRadius:16,padding:24,margin:24},
    title:{fontSize:'1.5rem',fontWeight:'bold',color:'#5288c1',marginBottom:16,textAlign:'center'},
    tabs:{display:'flex',marginBottom:16,borderRadius:8,overflow:'hidden'},
    tabBtn:(a)=>({flex:1,padding:'10px',background:a?'#5288c1':'#242f3d',border:'none',color:'#fff',cursor:'pointer',fontWeight:a?'bold':'normal'}),
    inp:{width:'100%',background:'#242f3d',border:'none',borderRadius:10,padding:'10px 14px',color:'#fff',fontSize:'1rem',outline:'none',marginBottom:12,boxSizing:'border-box'},
    btn:{width:'100%',background:'#5288c1',border:'none',borderRadius:10,padding:'12px',color:'#fff',fontSize:'1rem',fontWeight:'bold',cursor:'pointer'},
    error:{color:'#e53935',textAlign:'center',marginBottom:8,fontSize:'0.9rem'},
    avatarGrid:{display:'flex',flexWrap:'wrap',gap:8,justifyContent:'center',marginBottom:12},
    avatarBtn:(sel)=>({fontSize:'1.8rem',background:sel?'#5288c1':'#242f3d',border:'none',borderRadius:8,padding:'4px 8px',cursor:'pointer'}),
    list:{flex:1,overflowY:'auto'},
    listItem:{display:'flex',alignItems:'center',padding:'12px 16px',borderBottom:'1px solid #17212b',cursor:'pointer',gap:12},
    messages:{flex:1,overflowY:'auto',padding:'12px',display:'flex',flexDirection:'column',gap:8},
    bubble:(mine)=>({maxWidth:'75%',padding:'8px 12px',borderRadius:12,background:mine?'#2b5278':'#182533'}),
    msgMeta:{fontSize:'0.65rem',color:'#6b7f94',marginTop:4},
    inputBar:{background:'#17212b',padding:'8px 12px',display:'flex',alignItems:'center',gap:8,position:'relative'},
    msgInput:{flex:1,background:'#242f3d',border:'none',borderRadius:20,padding:'8px 14px',color:'#fff',fontSize:'1rem',outline:'none'},
    iconBtn:{background:'none',border:'none',fontSize:'1.4rem',cursor:'pointer'},
    sendBtn:{background:'#5288c1',border:'none',borderRadius:'50%',width:36,height:36,color:'#fff',cursor:'pointer'},
    stickerPicker:{position:'absolute',bottom:60,left:12,background:'#17212b',borderRadius:12,padding:8,display:'flex',gap:8,flexWrap:'wrap',width:200},
  };

  if (screen==='auth') return (
    <div style={s.screen}>
      <div style={{...s.header,justifyContent:'center'}}>
        <span style={{fontSize:'1.3rem',fontWeight:'bold',color:'#5288c1'}}>✈️ TeleClone</span>
      </div>
      <div style={s.card}>
        <div style={s.title}>{authTab==='login'?'Войти':'Регистрация'}</div>
        <div style={s.tabs}>
          <button style={s.tabBtn(authTab==='login')} onClick={()=>{setAuthTab('login');setError('');}}>Войти</button>
          <button style={s.tabBtn(authTab==='reg')} onClick={()=>{setAuthTab('reg');setError('');}}>Регистрация</button>
        </div>
        {error?<div style={s.error}>{error}</div>:null}
        <input style={s.inp} placeholder="Никнейм" value={username} onChange={e=>setUsername(e.target.value)}/>
        <input style={s.inp} placeholder="Пароль" type="password" value={password} onChange={e=>setPassword(e.target.value)}/>
        {authTab==='reg'&&<>
          <div style={{marginBottom:8,color:'#aaa'}}>Выбери аватар:</div>
          <div style={s.avatarGrid}>{AVATARS.map(a=><button key={a} style={s.avatarBtn(avatar===a)} onClick={()=>setAvatar(a)}>{a}</button>)}</div>
        </>}
        <button style={s.btn} onClick={authTab==='login'?login:register}>{authTab==='login'?'Войти':'Создать аккаунт'}</button>
      </div>
    </div>
  );

  if (screen==='chats') return (
    <div style={s.screen}>
      <div style={s.header}>
        <span style={{fontSize:'1.5rem'}}>{user?.avatar}</span>
        <span style={{fontWeight:'bold',flex:1}}>{user?.username}</span>
        <button style={{...s.back,fontSize:'1rem'}} onClick={logout}>Выйти</button>
      </div>
      <div style={{padding:'12px 16px',color:'#6b7f94',fontSize:'0.9rem'}}>👥 Все пользователи</div>
      <div style={s.list}>
        {users.length===0&&<div style={{textAlign:'center',color:'#6b7f94',padding:32}}>Нет других пользователей</div>}
        {users.map(u=>(
          <div key={u.id} style={s.listItem} onClick={()=>openChat(u)}>
            <span style={{fontSize:'2rem'}}>{u.avatar}</span>
            <div><div style={{fontWeight:'bold'}}>{u.username}</div><div style={{color:'#6b7f94',fontSize:'0.8rem'}}>Нажми чтобы написать</div></div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={s.screen}>
      <div style={s.header}>
        <button style={s.back} onClick={()=>setScreen('chats')}>←</button>
        <span style={{fontSize:'1.5rem'}}>{activeUser?.avatar}</span>
        <span style={{fontWeight:'bold'}}>{activeUser?.username}</span>
      </div>
      <div style={s.messages}>
        {messages.map((msg,i)=>(
          <div key={msg.id||i} style={{display:'flex',flexDirection:'column',alignItems:msg.from===user.username?'flex-end':'flex-start'}}>
            <div style={{...s.bubble(msg.from===user.username),fontSize:msg.type==='sticker'?'2.5rem':'1rem'}}>
              {msg.type==='voice'?<span>🎤 ▶ ━━━━━ 0:03</span>:msg.text}
              <div style={s.msgMeta}>{msg.from} · {new Date(msg.id).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
              <div style={{display:'flex',gap:4,marginTop:4}}>
                {STICKERS.slice(0,4).map(e=><span key={e} style={{cursor:'pointer',opacity:0.6}} onClick={()=>socket.emit('reaction',{room:activeRoom,msgId:msg.id,emoji:e})}>{e}</span>)}
              </div>
              {reactions[msg.id]?.length>0&&<div>{reactions[msg.id].join(' ')}</div>}
            </div>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>
      <div style={s.inputBar}>
        <button style={s.iconBtn} onClick={()=>setShowStickers(p=>!p)}>😊</button>
        {showStickers&&<div style={s.stickerPicker}>{STICKERS.map(e=><span key={e} style={{fontSize:'1.8rem',cursor:'pointer'}} onClick={()=>sendSticker(e)}>{e}</span>)}</div>}
        <input style={s.msgInput} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendMessage()} placeholder="Сообщение..."/>
        <button style={s.iconBtn} onClick={sendVoice}>🎤</button>
        <button style={s.sendBtn} onClick={sendMessage}>➤</button>
      </div>
    </div>
  );
}
