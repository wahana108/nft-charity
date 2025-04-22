const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const app = express();
const port = process.env.PORT || 3001; // Vercel akan set port otomatis

const supabaseUrl = 'https://oqquvpjikdbjlagdlbhp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xcXV2cGppa2RiamxhZ2RsYmhwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDk1MTgwOCwiZXhwIjoyMDYwNTI3ODA4fQ.cJri-wLQcDod3J49fUKesAY2cnghU3jtlD4BiuYMelw'; // Ganti dengan service_role key
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

app.use(express.json());
app.use(express.static('public'));

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization;
  console.log('Auth token:', token);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    console.error('Auth error:', error?.message);
    return res.status(401).send('Unauthorized');
  }
  console.log('Authenticated user:', user.id, user.email);
  req.user = user;
  next();
};

app.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Registering user:', email);
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });
    if (error) throw error;
    const user = data.user;
    console.log('User registered in auth:', user.id);
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert({ id: user.id, email: user.email, created_at: new Date().toISOString() })
      .select();
    if (userError) throw userError;
    console.log('User added to users table:', userData);
    res.json({ message: 'Registration successful', user });
  } catch (error) {
    console.error('Registration failed:', error.message);
    res.status(500).send(error.message);
  }
});

app.get('/nfts', async (req, res) => {
  try {
    console.log('Step 1: Fetching NFTs');
    const { data, error } = await supabase
      .from('nfts')
      .select('*')
      .order('likes_count', { ascending: false });
    if (error) throw error;
    const nftsWithContact = data.map(nft => {
      const [desc, contact] = nft.description ? nft.description.split(' | ') : ['', 'Contact not provided'];
      return {
        ...nft,
        description: desc || 'No description',
        contact: contact || 'Contact not provided'
      };
    });
    console.log('Step 2: NFTs fetched:', nftsWithContact);
    res.json(nftsWithContact);
  } catch (error) {
    console.error('Error fetching NFTs:', error.message);
    res.status(500).send(error.message);
  }
});

app.post('/nft', authenticate, async (req, res) => {
  try {
    const { title, description, image_file } = req.body;
    console.log('Step 1: Adding NFT - title:', title, 'description:', description, 'image_file:', !!image_file);
    console.log('User ID:', req.user.id);
    let image_url = null;
    if (image_file) {
      console.log('Step 2: Uploading image to nft-images');
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('nft-images')
        .upload(`${req.user.id}-${Date.now()}.jpg`, Buffer.from(image_file, 'base64'), { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;
      image_url = `${supabaseUrl}/storage/v1/object/public/nft-images/${uploadData.path}`;
      console.log('Step 3: Image uploaded:', image_url);
    }
    console.log('Step 4: Inserting NFT into nfts');
    const { data, error } = await supabase
      .from('nfts')
      .insert({ 
        title, 
        vendor_id: req.user.id, 
        price: 100000, 
        description: description || 'Contact not provided',
        image_url, 
        likes_count: 0,
        created_at: new Date().toISOString()
      })
      .select();
    if (error) throw error;
    console.log('Step 5: NFT added:', data);
    res.send('NFT added');
  } catch (error) {
    console.error('Error adding NFT:', error.message, error);
    res.status(500).send(error.message);
  }
});

app.post('/check-vote', authenticate, async (req, res) => {
  try {
    const { nft_id } = req.body;
    const nftIdNum = parseInt(nft_id);
    console.log('Step 1: Checking vote - nft_id:', nftIdNum, 'user_id:', req.user.id);
    const { data, error } = await supabase
      .from('votes')
      .select('id')
      .eq('nft_id', nftIdNum)
      .eq('user_id', req.user.id)
      .limit(1);
    if (error) throw error;
    const hasVoted = data.length > 0;
    console.log('Step 2: Check result:', { hasVoted });
    res.json({ hasVoted });
  } catch (error) {
    console.error('Error checking vote:', error.message);
    res.status(500).send(error.message);
  }
});

app.post('/vote', authenticate, async (req, res) => {
  try {
    const { nft_id } = req.body;
    const nftIdNum = parseInt(nft_id);
    console.log('Step 1: Preparing to vote - nft_id:', nftIdNum, 'user_id:', req.user.id);
    console.log('Step 2: Checking if NFT exists');
    const { data: nftExists, error: nftCheckError } = await supabase
      .from('nfts')
      .select('id, likes_count')
      .eq('id', nftIdNum)
      .single();
    if (nftCheckError || !nftExists) throw new Error('NFT not found');
    console.log('Step 3: Checking if user has voted');
    const { data: voteExists, error: voteCheckError } = await supabase
      .from('votes')
      .select('id')
      .eq('nft_id', nftIdNum)
      .eq('user_id', req.user.id)
      .limit(1);
    if (voteCheckError) throw voteCheckError;
    if (voteExists.length > 0) {
      console.log('Step 4: User has already voted');
      return res.status(400).send('Already liked');
    }
    console.log('Step 5: Adding vote to votes table');
    const { data: voteData, error: voteError } = await supabase
      .from('votes')
      .insert({ nft_id: nftIdNum, user_id: req.user.id, vote: 1, created_at: new Date().toISOString() })
      .select();
    if (voteError) throw voteError;
    console.log('Step 6: Vote added:', voteData);
    console.log('Step 7: Updating likes_count');
    const newLikesCount = (nftExists.likes_count || 0) + 1;
    const { data, error } = await supabase
      .from('nfts')
      .update({ likes_count: newLikesCount })
      .eq('id', nftIdNum)
      .select();
    if (error) throw error;
    console.log('Step 8: Likes updated:', data);
    res.send('Liked');
  } catch (error) {
    console.error('Error adding vote:', error.message, error);
    res.status(500).send(error.message);
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
