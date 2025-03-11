const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path'); // Tambahkan modul path

const app = express();
const port = process.env.PORT || 3001; // Vercel akan set port otomatis

const supabaseUrl = 'https://jmqwuaybvruzxddsppdh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptcXd1YXlidnJ1enhkZHNwcGRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA0MTUxNzEsImV4cCI6MjA1NTk5MTE3MX0.ldNdOrsb4BWyFRwZUqIFEbmU0SgzJxiF_Z7eGZPKZJg';
const supabase = createClient(supabaseUrl, supabaseKey);
app.use(express.json());
// Tambahkan middleware untuk X-Frame-Options
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'ALLOW-FROM https://nft-main-eight.vercel.app');
  next();
});
// Middleware untuk parsing JSON dan melayani file statis
app.use(express.static(path.join(__dirname, 'public'))); // Pastikan path ke public benar

// Route untuk root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).send('Unauthorized');
  req.user = user;
  next();
};

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

app.post('/nft', authenticate, async (req, res) => {
  try {
    const { title, description, image_file } = req.body;
    console.log('Step 1: Adding NFT - title:', title, 'description:', description, 'image_file:', !!image_file);
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

