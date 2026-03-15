import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

const SERVER = process.env.REACT_APP_SERVER || 'http://localhost:3001';
const socket = io(SERVER);

const STICKERS = ['😂','❤️','🔥','👍','😮','😢','🎉','💯'];

export default function App() {
  const [tab, setTab] = useState('chats');
  const [chats, setChats] = useState([]);
  const [channels, setChannels] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [activeInfo, setActiveInfo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [username] = useState('Nikita');
  const [reactions, setReactions] = useState({});
  const [showStickers, setShowStickers] = useState(false);
  const bottomRef = useRef();

  useEffect(() => {
    axios.get(`${SERVER}/chats`).then(r => setChats(r.data));
    axios.get(`${SERVER}/channels`).then(r => setChannels(r.data));
    socket.on('message', msg => setMessages(p => [...p, msg]));
    socket.on('reaction', data => {
      setReactions(p => ({...p, [data.msgId]: [...(p[data.msgId]||[]), data.emoji]}));
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const openRoom = async (id, info) => {
    setActiveRoom(id);
    setActiveInfo(info);
    socket.emit('join', id);
    const r = await axios.get(`${SERVER}/messages/${id}`);
    setMessages(r.data);
  };

  const sendMessage = () => {
    if (!input.trim()) return;
    const msg = { room: activeRoom, text: input, from: username, id: Date.now(), type: 'text' };
    socket.emit('message', msg);
    setInput('');
  };

  const sendVoice = () => {
    const msg = { room: activeRoom, text: '🎤 Голосовое сообщение', from: username, id: Date.now(), type: 'voice' };
    socket.emit('message', msg);
  };

  const sendSticker = (emoji) => {
    const msg = { room: activeRoom, text: emoji, from: username, id: Date.now(), type: 'sticker' };
    socket.emit('message', msg);
    setShowStickers(false);
  };

  const addReaction = (msgId, emoji) => {
    socket.emit('reaction', { room: activeRoom, msgId, emoji });
  };

  const s = styles;

  if (activeRoom) return (
    <div style={s.screen}>
      <div style={s.header}>
        <button style={s.back} onClick={() => setActiveRoom(null)}>←</button>
        <span style={s.headerAvatar}>{activeInfo?.avatar || activeInfo?.icon}</span>
        <span style={s.headerName}>{activeInfo?.name}</span>
      </div>
      <div style={s.messages}>
        {messages.map(msg => (
          <div key={msg.id} style={{...s.msgWrap, alignItems: msg.from===username?'flex-end':'flex-start'}}>
            <div style={{...s.bubble, background: msg.from===username?'#2b5278':'#182533',
              fontSize: msg.type==='sticker'?'2.5rem':'1rem'}}>
              {msg.type==='voice' ? <div style={s.voice}>🎤 ▶ ━━━━━━ 0:03</div> : msg.text}
              <div style={s.msgMeta}>{msg.from} · {new Date(msg.id).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
              <div style={s.reactionBar}>
                {STICKERS.slice(0,4).map(e => (
                  <span key={e} style={s.reactionBtn} onClick={() => addReaction(msg.id, e)}>{e}</span>
                ))}
              </div>
              {reactions[msg.id]?.length > 0 && (
                <div style={s.reactions}>{reactions[msg.id].join(' ')}</div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>
      <div style={s.inputBar}>
        <button style={s.iconBtn} onClick={() => setShowStickers(p=>!p)}>😊</button>
        {showStickers && (
          <div style={s.stickerPicker}>
            {STICKERS.map(e => <span key={e} style={s.stickerItem} onClick={() => sendSticker(e)}>{e}</span>)}
          </div>
        )}
        <input style={s.input} value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&sendMessage()} placeholder="Сообщение..."/>
        <button style={s.iconBtn} onClick={sendVoice}>🎤</button>
        <button style={s.sendBtn} onClick={sendMessage}>➤</button>
      </div>
    </div>
  );

  return (
    <div style={s.screen}>
      <div style={s.header}>
        <span style={s.logo}>✈️ TeleClone</span>
      </div>
      <div style={s.tabs}>
        <button style={{...s.tab, borderBottom: tab==='chats'?'2px solid #5288c1':'none'}} onClick={()=>setTab('chats')}>💬 Чаты</button>
        <button style={{...s.tab, borderBottom: tab==='channels'?'2px solid #5288c1':'none'}} onClick={()=>setTab('channels')}>📢 Каналы</button>
      </div>
      <div style={s.list}>
        {(tab==='chats'?chats:channels).map(item => (
          <div key={item.id} style={s.listItem} onClick={() => openRoom(item.id, item)}>
            <span style={s.avatar}>{item.avatar||item.icon}</span>
            <div style={s.listInfo}>
              <div style={s.listName}>{item.name}</div>
              <div style={s.listSub}>Нажми чтобы открыть</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  screen: { background:'#0e1621', minHeight:'100vh', color:'#fff', fontFamily:'sans-serif', display:'flex', flexDirection:'column' },
  header: { background:'#17212b', padding:'12px 16px', display:'flex', alignItems:'center', gap:10 },
  logo: { fontSize:'1.2rem', fontWeight:'bold', color:'#5288c1' },
  back: { background:'none', border:'none', color:'#5288c1', fontSize:'1.4rem', cursor:'pointer' },
  headerAvatar: { fontSize:'1.5rem' },
  headerName: { fontWeight:'bold', fontSize:'1.1rem' },
  tabs: { display:'flex', background:'#17212b', borderBottom:'1px solid #293748' },
  tab: { flex:1, padding:'10px', background:'none', border:'none', color:'#aaa', cursor:'pointer', fontSize:'0.95rem' },
  list: { flex:1, overflowY:'auto' },
  listItem: { display:'flex', alignItems:'center', padding:'12px 16px', borderBottom:'1px solid #17212b', cursor:'pointer', gap:12 },
  avatar: { fontSize:'2rem', width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center' },
  listInfo: { flex:1 },
  listName: { fontWeight:'bold', fontSize:'1rem' },
  listSub: { color:'#6b7f94', fontSize:'0.8rem', marginTop:2 },
  messages: { flex:1, overflowY:'auto', padding:'12px', display:'flex', flexDirection:'column', gap:8 },
  msgWrap: { display:'flex', flexDirection:'column' },
  bubble: { maxWidth:'75%', padding:'8px 12px', borderRadius:12, wordBreak:'break-word' },
  msgMeta: { fontSize:'0.65rem', color:'#6b7f94', marginTop:4 },
  voice: { display:'flex', alignItems:'center', gap:6, color:'#5288c1' },
  reactionBar: { display:'flex', gap:4, marginTop:4 },
  reactionBtn: { cursor:'pointer', fontSize:'0.9rem', opacity:0.6 },
  reactions: { fontSize:'0.9rem', marginTop:2 },
  inputBar: { background:'#17212b', padding:'8px 12px', display:'flex', alignItems:'center', gap:8, position:'relative' },
  input: { flex:1, background:'#242f3d', border:'none', borderRadius:20, padding:'8px 14px', color:'#fff', fontSize:'1rem', outline:'none' },
  iconBtn: { background:'none', border:'none', fontSize:'1.4rem', cursor:'pointer' },
  sendBtn: { background:'#5288c1', border:'none', borderRadius:'50%', width:36, height:36, color:'#fff', fontSize:'1.1rem', cursor:'pointer' },
  stickerPicker: { position:'absolute', bottom:60, left:12, background:'#17212b', borderRadius:12, padding:8, display:'flex', gap:8, flexWrap:'wrap', width:200 },
  stickerItem: { fontSize:'1.8rem', cursor:'pointer' },
};
