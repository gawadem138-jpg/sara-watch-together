const socket = io();

const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('code');
const userName = sessionStorage.getItem('sara_name') || 'Guest';

if (!roomCode) window.location.href = '/';

document.getElementById('roomCode').textContent = roomCode;

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

document.getElementById('copyCode').addEventListener('click', () => {
  navigator.clipboard.writeText(roomCode);
  showToast('Room code copied!');
});

// Mobile Tab Toggle
const roomBodyWrap = document.getElementById('roomBodyWrap');
const tabWatchBtn = document.getElementById('tabWatchBtn');
const tabChatBtn = document.getElementById('tabChatBtn');

if (tabWatchBtn && tabChatBtn) {
  tabWatchBtn.addEventListener('click', () => {
    tabWatchBtn.classList.add('active');
    tabChatBtn.classList.remove('active');
    roomBodyWrap.setAttribute('data-active-tab', 'watch');
  });

  tabChatBtn.addEventListener('click', () => {
    tabChatBtn.classList.add('active');
    tabWatchBtn.classList.remove('active');
    roomBodyWrap.setAttribute('data-active-tab', 'chat');
  });
}

// Media Elements
const localVideo = document.getElementById('localVideo');
const emptyPlayer = document.getElementById('emptyPlayer');
const youtubePlayerEl = document.getElementById('youtubePlayer');

let ytPlayer = null;
let currentSourceType = null;
let isSyncing = false;

// YouTube iFrame API
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

function onYouTubeIframeAPIReady() {
  ytPlayer = new YT.Player('youtubePlayer', {
    height: '100%',
    width: '100%',
    playerVars: { 'autoplay': 1, 'controls': 1, 'playsinline': 1 },
    events: {
      'onStateChange': (event) => {
        if (isSyncing) return;
        if (event.data === YT.PlayerState.PLAYING) {
          socket.emit('media-action', { type: 'play', time: ytPlayer.getCurrentTime() });
        } else if (event.data === YT.PlayerState.PAUSED) {
          socket.emit('media-action', { type: 'pause', time: ytPlayer.getCurrentTime() });
        }
      }
    }
  });
}

// Native Video Sync Listeners (Google Drive & Local Video)
localVideo.onplay = () => {
  if (!isSyncing) socket.emit('media-action', { type: 'play', time: localVideo.currentTime });
};
localVideo.onpause = () => {
  if (!isSyncing) socket.emit('media-action', { type: 'pause', time: localVideo.currentTime });
};
localVideo.onseeking = () => {
  if (!isSyncing) socket.emit('media-action', { type: 'seek', time: localVideo.currentTime });
};

// Join Room
socket.emit('join-room', { roomCode, name: userName }, (res) => {
  if (!res.success) {
    alert(res.error);
    window.location.href = '/';
  }
});

socket.on('room-members', (members) => {
  const partner = members.find(m => m.name !== userName);
  document.getElementById('partnerName').textContent = partner ? partner.name : 'Waiting for partner...';
});

// Source Selector Tabs
const btnYoutube = document.getElementById('btnYoutube');
const btnDrive = document.getElementById('btnDrive');
const btnLocal = document.getElementById('btnLocal');
const panelYoutube = document.getElementById('panelYoutube');
const panelDrive = document.getElementById('panelDrive');
const panelLocal = document.getElementById('panelLocal');

btnYoutube.addEventListener('click', () => switchTab('youtube'));
btnDrive.addEventListener('click', () => switchTab('gdrive'));
btnLocal.addEventListener('click', () => switchTab('local'));

function switchTab(type) {
  [btnYoutube, btnDrive, btnLocal].forEach(b => b.classList.remove('active'));
  [panelYoutube, panelDrive, panelLocal].forEach(p => p.style.display = 'none');

  if (type === 'youtube') {
    btnYoutube.classList.add('active');
    panelYoutube.style.display = 'flex';
  } else if (type === 'gdrive') {
    btnDrive.classList.add('active');
    panelDrive.style.display = 'flex';
  } else if (type === 'local') {
    btnLocal.classList.add('active');
    panelLocal.style.display = 'flex';
  }
}

// Extract Google Drive File ID
function extractDriveId(url) {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// Load Video Events
document.getElementById('loadYoutube').addEventListener('click', () => {
  const url = document.getElementById('youtubeUrl').value;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  if (match) {
    socket.emit('change-source', { type: 'youtube', url: match[1], title: 'YouTube Video' });
  } else {
    showToast('Invalid YouTube URL');
  }
});

document.getElementById('loadDrive').addEventListener('click', () => {
  const url = document.getElementById('driveUrl').value;
  const fileId = extractDriveId(url);
  if (fileId) {
    // Direct video stream URL for HTML5 player
    const directStreamUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
    socket.emit('change-source', { type: 'gdrive', url: directStreamUrl, title: 'Google Drive Video' });
  } else {
    showToast('Invalid Google Drive link');
  }
});

document.getElementById('localFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const objectUrl = URL.createObjectURL(file);
    socket.emit('change-source', { type: 'local', url: '', title: file.name });
    setupLocalPlayer(objectUrl);
  }
});

socket.on('source-changed', (data) => {
  emptyPlayer.style.display = 'none';
  youtubePlayerEl.style.display = 'none';
  localVideo.style.display = 'none';

  currentSourceType = data.type;

  if (data.type === 'youtube' && ytPlayer) {
    youtubePlayerEl.style.display = 'block';
    ytPlayer.loadVideoById(data.sourceUrl);
  } else if (data.type === 'gdrive') {
    localVideo.style.display = 'block';
    localVideo.src = data.sourceUrl;
    localVideo.play().catch(() => {});
  } else if (data.type === 'local') {
    localVideo.style.display = 'block';
    showToast('Host loaded local video. Select the same video on your device to watch.');
  }
});

function setupLocalPlayer(url) {
  localVideo.style.display = 'block';
  emptyPlayer.style.display = 'none';
  localVideo.src = url;
  localVideo.play().catch(() => {});
}

socket.on('media-action', (action) => {
  isSyncing = true;
  if (currentSourceType === 'youtube' && ytPlayer) {
    if (Math.abs(ytPlayer.getCurrentTime() - action.time) > 1.2) ytPlayer.seekTo(action.time, true);
    if (action.type === 'play') ytPlayer.playVideo();
    if (action.type === 'pause') ytPlayer.pauseVideo();
  } else if ((currentSourceType === 'gdrive' || currentSourceType === 'local') && localVideo) {
    if (Math.abs(localVideo.currentTime - action.time) > 1.2) localVideo.currentTime = action.time;
    if (action.type === 'play') localVideo.play().catch(() => {});
    if (action.type === 'pause') localVideo.pause();
  }
  setTimeout(() => { isSyncing = false; }, 600);
});

// Chat
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (text) {
    socket.emit('send-message', text);
    chatInput.value = '';
    socket.emit('typing', false);
  }
});

chatInput.addEventListener('input', () => {
  socket.emit('typing', chatInput.value.length > 0);
});

socket.on('new-message', (msg) => {
  const isMe = msg.sender === userName;
  const div = document.createElement('div');
  div.className = `msg ${isMe ? 'me' : 'partner'}`;
  div.innerHTML = `<div class="msg-author">${msg.sender}</div>${msg.text}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on('user-typing', ({ user, isTyping }) => {
  document.getElementById('typingIndicator').textContent = isTyping ? `${user} is typing...` : '';
});

socket.on('sys-message', (msg) => showToast(msg));