const supabase = window.supabase.createClient('https://oqquvpjikdbjlagdlbhp.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xcXV2cGppa2RiamxhZ2RsYmhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ5NTE4MDgsImV4cCI6MjA2MDUyNzgwOH0.ec28Q9VqiW2FomXESxVkiYswtWe6kJS-Vpc7W_tMsuU');
let token;

async function login() {
  try {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    console.log('Attempting login with:', email);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });
    if (error) throw error;
    token = data.session.access_token;
    console.log('Login successful:', token);
    localStorage.setItem('authToken', token);
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('explore').style.display = 'block';
    loadNFTs();
  } catch (error) {
    console.error('Login failed:', error.message);
    alert('Login failed: ' + error.message);
  }
}

async function register() {
  try {
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    console.log('Attempting registration with:', email);
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText);
    }
    const data = await res.json();
    console.log('Registration successful:', data);
    alert('Registration successful! Please login.');
    showLogin();
  } catch (error) {
    console.error('Registration failed:', error.message);
    alert('Registration failed: ' + error.message);
  }
}

async function loadNFTs(searchQuery = '') {
  try {
    const res = await fetch('/nfts', { 
      headers: { 
        Authorization: token, 
        'Cache-Control': 'no-cache' 
      } 
    });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const nfts = await res.json();
    console.log('NFTs loaded:', nfts);
    const filteredNfts = searchQuery
      ? nfts.filter(nft => nft.title.toLowerCase().includes(searchQuery.toLowerCase()))
      : nfts;
    const list = document.getElementById('nft-list');
    list.innerHTML = '';
    if (filteredNfts.length === 0) {
      list.innerHTML = '<p>No NFTs available or no matches found.</p>';
    } else {
      filteredNfts.forEach(nft => {
        const div = document.createElement('div');
        div.innerHTML = `
          ${nft.image_url ? `<img src="${nft.image_url}" alt="${nft.title}" style="max-width: 100px;">` : ''}
          <h3>${nft.title}</h3>
          <p>Description: ${nft.description}</p>
          <p>Vendor: ${nft.vendor_id} | Rp${nft.price} | Contact: ${nft.contact} | Likes: ${nft.likes_count || 0}</p>
          <button class="like-btn" data-nft-id="${nft.id}">Like</button>
        `;
        list.appendChild(div);
      });
      document.querySelectorAll('.like-btn').forEach(async btn => {
        const nftId = btn.getAttribute('data-nft-id');
        const res = await fetch('/check-vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token },
          body: JSON.stringify({ nft_id: nftId })
        });
        if (!res.ok) throw new Error('Check vote failed');
        const { hasVoted } = await res.json();
        if (hasVoted) {
          btn.disabled = true;
          btn.textContent = 'Liked';
        } else {
          btn.addEventListener('click', () => vote(nftId, btn));
        }
      });
    }
  } catch (error) {
    console.error('Error loading NFTs:', error.message);
  }
}

async function vote(nft_id, button) {
  try {
    const res = await fetch('/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({ nft_id })
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Vote failed: ${res.status} - ${errorText}`);
    }
    console.log('Vote successful');
    button.disabled = true;
    button.textContent = 'Liked';
    loadNFTs(document.getElementById('nft-search').value);
  } catch (error) {
    console.error('Vote failed:', error.message);
  }
}

function logout() {
  localStorage.removeItem('authToken');
  window.location.href = '/index.html';
}

function showRegister() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'block';
}

function showLogin() {
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'block';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-btn')?.addEventListener('click', login);
  document.getElementById('register-btn')?.addEventListener('click', register);
  document.getElementById('logout-btn')?.addEventListener('click', logout);
  document.getElementById('show-register-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    showRegister();
  });
  document.getElementById('show-login-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    showLogin();
  });
  const searchInput = document.getElementById('nft-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      loadNFTs(e.target.value);
    });
  }
  const backButton = document.getElementById('back-to-mastermind');
  if (backButton) {
    backButton.addEventListener('click', () => {
      window.location.href = 'https://nft-main-bice.vercel.app';
    });
  }
});
