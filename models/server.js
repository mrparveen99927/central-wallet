// ==========================================
// STEP 1: सभी जरूरी पैकेजेस (Imports)
// ==========================================
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// मॉडल्स इम्पोर्ट करें
const User = require('./models/User');

// एनवायरनमेंट वेरिएबल्स लोड करें
require('dotenv').config({ path: './env.txt' });
require('dotenv').config(); 

const app = express();

// ==========================================
// STEP 2: मिडिलवेयर्स (Middlewares)
// ==========================================
app.use(cors()); 
app.use(express.json()); 

// ==========================================
// STEP 3: डेटाबेस कनेक्शन (MongoDB Atlas)
// ==========================================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🔥 SUCCESS: MongoDB Atlas से कनेक्शन हो गया है!'))
  .catch((err) => console.log('❌ ERROR: कनेक्शन फेल:', err.message));

// ==========================================
// STEP 4: बेसिक टेस्टिंग रूट
// ==========================================
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Central Wallet Backend Engine is Running Live! 🚀'
  });
});

// ==========================================
// STEP 5: यूजर रजिस्ट्रेशन (SIGN UP) API
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  const { firstName, lastName, mobile, email, password, referredBy } = req.body;

  try {
    const userExists = await User.findOne({ $or: [{ mobile }, { email }] });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'मोबाइल या ईमेल पहले से इस्तेमाल में है!' });
    }

    const totalUsers = await User.countDocuments();
    const nextSequence = 1001 + totalUsers;
    const generatedUid = `CW${nextSequence}`;
    const generatedUpi = `${generatedUid.toLowerCase()}@centralwallet`;
    const cleanName = firstName.replace(/\s+/g, '').substring(0, 4).toUpperCase();
    const generatedReferral = `${cleanName}${nextSequence}`;

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      uid: generatedUid,
      firstName,
      lastName,
      mobile,
      email,
      password: hashedPassword,
      customUpiId: generatedUpi,
      referralCode: generatedReferral,
      referredBy: referredBy || null
    });

    await newUser.save();

    res.status(201).json({
      success: true,
      message: 'रजिस्ट्रेशन सफल रहा!',
      data: { uid: generatedUid, upiId: generatedUpi, referralCode: generatedReferral }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'सर्वर एरर: ' + error.message });
  }
});

// ==========================================
// STEP 6: यूजर लॉगिन (LOGIN) API
// ==========================================
app.post('/api/auth/login', async (req, res) => {
  const { loginId, password } = req.body;

  try {
    const user = await User.findOne({
      $or: [{ uid: loginId }, { mobile: loginId }, { email: loginId }]
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'यूजर मौजूद नहीं है!' });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, message: 'आपका अकाउंट बैन कर दिया गया है!' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'गलन पासवर्ड!' });
    }

    const token = jwt.sign(
      { id: user._id, uid: user.uid },
      process.env.JWT_SECRET || 'CentralWalletSuperSecretKey2026',
      { expiresIn: '30d' }
    );

    res.status(200).json({
      success: true,
      message: 'लॉगिन सफल रहा!',
      token,
      user: {
        uid: user.uid,
        firstName: user.firstName,
        lastName: user.lastName,
        customUpiId: user.customUpiId,
        alphaCoins: user.alphaCoins,
        realMoneyBalance: user.realMoneyBalance
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'सर्वर एरर: ' + error.message });
  }
});
// ==========================================
// STEP 6.5: गेमिंग और मनी फ्लो लूप (THE GOLDEN LAW)
// ==========================================
const Transaction = require('./models/Transaction'); // ट्रांजैक्शन पासबुक मॉडल

// 1. वॉलेट से गेम में कॉइन्स भेजने की API (Wallet to Game)
app.post('/api/game/deposit', async (req, res) => {
  const { uid, amount, secretToken } = req.body;

  // सुरक्षा जांच: केवल सीक्रेट टोकन वाला गेम ही इस API को चला सकता है
  if (!secretToken || secretToken !== process.env.GAME_SECRET_TOKEN) {
    return res.status(401).json({ success: false, message: 'अनधिकृत पहुंच! सीक्रेट टोकन गलत है।' });
  }

  const coinAmount = Number(amount);
  if (isNaN(coinAmount) || coinAmount <= 0) {
    return res.status(400).json({ success: false, message: 'कृपया सही कॉइन अमाउंट दर्ज करें!' });
  }

  try {
    // यूजर का वॉलेट ढूंढो
    const user = await User.findOne({ uid });
    if (!user) {
      return res.status(404).json({ success: false, message: 'यूजर नहीं मिला!' });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, message: 'यह अकाउंट बैन है!' });
    }

    // जांचें कि यूजर के वॉलेट में पर्याप्त कॉइन्स हैं या नहीं
    if (user.alphaCoins < coinAmount) {
      return res.status(400).json({ success: false, message: 'वॉलेट में पर्याप्त Alpha Coins नहीं हैं!' });
    }

    // वॉलेट से कॉइन्स काटना
    user.alphaCoins -= coinAmount;
    await user.save();

    // यूनिक ट्रांजैक्शन आईडी बनाना
    const generatedTxnId = 'TXN' + crypto.randomBytes(4).toString('hex').toUpperCase();

    // पासबुक (Transaction History) में एंट्री दर्ज करना
    const newTxn = new Transaction({
      txnId: generatedTxnId,
      senderId: uid,
      receiverId: 'GAME',
      amount: coinAmount,
      type: 'Wallet_to_Game',
      status: 'Success'
    });
    await newTxn.save();

    res.status(200).json({
      success: true,
      message: 'कॉइन्स सफलतापूर्वक गेम में ट्रांसफर हो गए हैं!',
      txnId: generatedTxnId,
      remainingCoins: user.alphaCoins
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'सर्वर एरer: ' + error.message });
  }
});

// 2. गेम से वापस मुख्य वॉलेट में कॉइन्स लाने की API (Game to Wallet)
app.post('/api/game/withdraw', async (req, res) => {
  const { uid, amount, secretToken } = req.body;

  // सुरक्षा जांच
  if (!secretToken || secretToken !== process.env.GAME_SECRET_TOKEN) {
    return res.status(401).json({ success: false, message: 'अनधिकृत पहुंच! सीक्रेट टोकन गलत है।' });
  }

  const coinAmount = Number(amount);
  if (isNaN(coinAmount) || coinAmount <= 0) {
    return res.status(400).json({ success: false, message: 'कृपया सही कॉइन अमाउंट दर्ज करें!' });
  }

  try {
    const user = await User.findOne({ uid });
    if (!user) {
      return res.status(404).json({ success: false, message: 'यूजर नहीं मिला!' });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, message: 'यह अकाउंट बैन है!' });
    }

    // गेम से जीते हुए कॉइन्स मुख्य वॉलेट में जोड़ना
    user.alphaCoins += coinAmount;
    await user.save();

    // यूनिक ट्रांजैक्शन आईडी बनाना
    const generatedTxnId = 'TXN' + crypto.randomBytes(4).toString('hex').toUpperCase();

    // पासबुक में एंट्री दर्ज करना
    const newTxn = new Transaction({
      txnId: generatedTxnId,
      senderId: 'GAME',
      receiverId: uid,
      amount: coinAmount,
      type: 'Game_to_Wallet',
      status: 'Success'
    });
    await newTxn.save();

    res.status(200).json({
      success: true,
      message: 'जीते हुए कॉइन्स सफलतापूर्वक मुख्य वॉलेट में जोड़ दिए गए हैं!',
      txnId: generatedTxnId,
      totalCoins: user.alphaCoins
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'सर्वर एरer: ' + error.message });
  }
});
// ==========================================
// STEP 6.6: डिपाजिट, विड्रॉल और कनवर्ट लॉजिक
// ==========================================

// 1. यूजर द्वारा डिपाजिट रिक्वेस्ट भेजना (UTR सबमिशन)
app.post('/api/wallet/deposit-request', async (req, res) => {
  const { uid, amount, utrNumber } = req.body;

  if (!uid || !amount || !utrNumber) {
    return res.status(400).json({ success: false, message: 'कृपया सभी जरूरी जानकारी (UID, Amount, UTR) भरें!' });
  }

  // UTR नंबर हमेशा 12 अंकों का होना चाहिए
  if (utrNumber.trim().length !== 12) {
    return res.status(400).json({ success: false, message: 'कृपया सही 12-अंकों का UTR नंबर दर्ज करें!' });
  }

  try {
    // सुरक्षा जांच: क्या यह UTR नंबर पहले से डेटाबेस में मौजूद है? (डुप्लीकेट UTR ब्लॉक सुरक्षा)
    const utrExists = await Transaction.findOne({ utrNumber: utrNumber.trim() });
    if (utrExists) {
      return res.status(400).json({ success: false, message: 'यह UTR नंबर पहले ही इस्तेमाल किया जा चुका है! धोखाधड़ी प्रतिबंधित है।' });
    }

    // चेक करो यूजर मौजूद है या नहीं
    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ success: false, message: 'यूजर नहीं मिला!' });

    // यूनिक ट्रांजैक्शन आईडी जनरेट करना
    const generatedTxnId = 'DEP' + crypto.randomBytes(4).toString('hex').toUpperCase();

    // ट्रांजैक्शन पासबुक में 'Pending' स्टेटस के साथ एंट्री दर्ज करना
    const depositTxn = new Transaction({
      txnId: generatedTxnId,
      senderId: 'BANK',
      receiverId: uid,
      amount: Number(amount),
      type: 'Deposit',
      utrNumber: utrNumber.trim(),
      status: 'Pending' // यह एडमिन CPanel से अप्रूव होने का इंतजार करेगा
    });

    await depositTxn.save();

    res.status(201).json({
      success: true,
      message: 'डिपॉजिट रिक्वेस्ट सफलतापूर्वक सबमिट हो गई है! एडमिन की मंजूरी का इंतजार करें।',
      txnId: generatedTxnId
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'सर्वर एरर: ' + error.message });
  }
});

// 2. यूजर द्वारा विड्रॉल रिक्वेस्ट लगाना
app.post('/api/wallet/withdraw-request', async (req, res) => {
  const { uid, amount } = req.body; // CPanel आर्किटेक्चर के अनुसार बैंक/UPI डिटेल्स CPanel पर डायरेक्ट शो होंगी

  const withdrawAmount = Number(amount);
  if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
    return res.status(400).json({ success: false, message: 'कृपया सही अमाउंट दर्ज करें!' });
  }

  try {
    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ success: false, message: 'यूजर नहीं मिला!' });

    // चेक करो कि यूजर के पास उतने कॉइन्स हैं भी या नहीं
    if (user.alphaCoins < withdrawAmount) {
      return res.status(400).json({ success: false, message: 'विड्रॉल के लिए आपके वॉलेट में पर्याप्त कॉइन्स नहीं हैं!' });
    }

    // विड्रॉल के समय कॉइन्स मुख्य बैलेंस से तुरंत कटेंगे (CPanel रिजेक्शन पर वापस लौटेंगे)
    user.alphaCoins -= withdrawAmount;
    await user.save();

    const generatedTxnId = 'WTH' + crypto.randomBytes(4).toString('hex').toUpperCase();

    // पासबुक में पेंडिंग एंट्री
    const withdrawTxn = new Transaction({
      txnId: generatedTxnId,
      senderId: uid,
      receiverId: 'BANK',
      amount: withdrawAmount,
      type: 'Withdrawal',
      status: 'Pending' // यह एडमिन CPanel से भुगतान होने तक पेंडिंग रहेगा
    });

    await withdrawTxn.save();

    res.status(201).json({
      success: true,
      message: 'विड्रॉल रिक्वेस्ट सबमिट हो गई है! कॉइन्स आपके वॉलेट से होल्ड कर दिए गए हैं।',
      txnId: generatedTxnId,
      remainingCoins: user.alphaCoins
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'सर्वर एरर: ' + error.message });
  }
});

// 3. कॉइन्स को असली पैसों में बदलना (Convert Coins to Real Money)
app.post('/api/wallet/convert', async (req, res) => {
  const { uid, coinAmount, mpin } = req.body;

  const coinsToConvert = Number(coinAmount);
  if (isNaN(coinsToConvert) || coinsToConvert <= 0) {
    return res.status(400).json({ success: false, message: 'कृपया सही कॉइन संख्या डालें!' });
  }

  try {
    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ success: false, message: 'यूजर नहीं मिला!' });

    // सुरक्षा जांच: MPIN सही है या नहीं
    if (!user.mpin || user.mpin !== mpin) {
      return res.status(400).json({ success: false, message: 'गलत सुरक्षा MPIN! ट्रांजैक्शन अस्वीकार किया गया।' });
    }

    // चेक करो कि पर्याप्त अल्फा कॉइन्स हैं या नहीं
    if (user.alphaCoins < coinsToConvert) {
      return res.status(400).json({ success: false, message: 'कन्वर्ट करने के लिए पर्याप्त Alpha Coins नहीं हैं!' });
    }

    // द गोल्डन लॉ रेट: 1 Alpha Coin = 1 INR
    const convertedAmount = coinsToConvert * 1; 

    // गणितीय अदला-बदली (Atomic Update)
    user.alphaCoins -= coinsToConvert;
    user.realMoneyBalance += convertedAmount;
    await user.save();

    res.status(200).json({
      success: true,
      message: `सफलतापूर्वक ${coinsToConvert} कॉइन्स को ₹${convertedAmount} असली पैसों में बदल दिया गया है!`,
      alphaCoins: user.alphaCoins,
      realMoneyBalance: user.realMoneyBalance
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'सर्वर एरर: ' + error.message });
  }
});

// ==========================================
// STEP 7: एडमिन CPANEL आर्किटेक्चर लाइव कंट्रोल्स APIs
// ==========================================

// 1. CPanel के 4 समरी बॉक्स का डेटा (Total Users, Deposits, Withdrawals, New Users)
app.get('/api/admin/dashboard-summary', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    
    // आज रात 12 बजे से अब तक का समय (Today's New Users के लिए)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayNewUsers = await User.countDocuments({ createdAt: { $gte: startOfToday } });

    // केवल 'Success' वाले डिपॉजिट और विड्रॉल का कुल जोड़ निकालना
    const depositSummary = await Transaction.aggregate([
      { $match: { type: 'Deposit', status: 'Success' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    const withdrawalSummary = await Transaction.aggregate([
      { $match: { type: 'Withdrawal', status: 'Success' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        todayNewUsers,
        totalDeposit: depositSummary[0]?.total || 0,
        totalWithdrawal: withdrawalSummary[0]?.total || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'सर्वर एरर: ' + error.message });
  }
});

// 2. लाइव यूजर टेबल और सर्च बार (नाम, UID या मोबाइल से सर्च करने के लिए)
app.get('/api/admin/users', async (req, res) => {
  const { search } = req.query; 
  try {
    let query = {};
    if (search) {
      query = {
        $or: [
          { uid: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { mobile: { $regex: search, $options: 'i' } }
        ]
      };
    }
    // नए यूजर्स सबसे ऊपर दिखेंगे
    const users = await User.find(query).sort({ createdAt: -1 });
    res.status(200).json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'सर्वर एरर: ' + error.message });
  }
});

// 3. डिपॉजिट रिक्वेस्ट एक्शन (Approve होने पर कॉइन क्रेडिट होंगे, Decline पर फेल)
app.post('/api/admin/deposit/process', async (req, res) => {
  const { txnId, action } = req.body; // action में 'Approve' या 'Decline' आएगा

  try {
    const txn = await Transaction.findOne({ txnId, type: 'Deposit' });
    if (!txn) return res.status(404).json({ success: false, message: 'यह डिपॉजिट रिक्वेस्ट नहीं मिली!' });
    if (txn.status !== 'Pending') return res.status(400).json({ success: false, message: 'यह रिक्वेस्ट पहले ही प्रोसेस हो चुकी है!' });

    const user = await User.findOne({ uid: txn.receiverId });
    if (!user) return res.status(404).json({ success: false, message: 'यूजर नहीं मिला!' });

    if (action === 'Approve') {
      // 1 INR = 1 Alpha Coin के नियम से कॉइन्स जोड़ो
      user.alphaCoins += txn.amount;
      await user.save();
      txn.status = 'Success';
    } else if (action === 'Decline') {
      txn.status = 'Failed';
    } else {
      return res.status(400).json({ success: false, message: 'गलत एक्शन! केवल Approve या Decline डालें।' });
    }

    await txn.save();
    res.status(200).json({ success: true, message: `डिपॉजिट रिक्वेस्ट सफलतापूर्वक ${action} कर दी गई है।` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'सर्वर एरर: ' + error.message });
  }
});

// 4. विड्रॉल रिक्वेस्ट एक्शन (Decline होने पर कॉइन यूजर के वॉलेट में वापस लौटेंगे)
app.post('/api/admin/withdrawal/process', async (req, res) => {
  const { txnId, action } = req.body; // action में 'Approve' या 'Decline' आएगा

  try {
    const txn = await Transaction.findOne({ txnId, type: 'Withdrawal' });
    if (!txn) return res.status(404).json({ success: false, message: 'यह विड्रॉल रिक्वेस्ट नहीं मिली!' });
    if (txn.status !== 'Pending') return res.status(400).json({ success: false, message: 'यह रिक्वेस्ट पहले ही प्रोसेस हो चुकी है!' });

    const user = await User.findOne({ uid: txn.senderId });
    if (!user) return res.status(404).json({ success: false, message: 'यूजर नहीं मिला!' });

    if (action === 'Approve') {
      // कॉइन्स यूजर ऐप से रिक्वेस्ट लगाते समय ही कट चुके थे, इसलिए यहाँ सिर्फ सक्सेस करना है
      txn.status = 'Success';
    } else if (action === 'Decline') {
      // द गोल्डन लॉ नियम: विड्रॉल रिजेक्ट होने पर कॉइन वापस यूजर वॉलेट में लौटेंगे
      user.alphaCoins += txn.amount; 
      await user.save();
      txn.status = 'Failed'; // पासबुक में Withdrawal Failed दिखेगा
    } else {
      return res.status(400).json({ success: false, message: 'गलत एक्शन!' });
    }

    await txn.save();
    res.status(200).json({ success: true, message: `विड्रॉल रिक्वेस्ट सफलतापूर्वक ${action} कर दी गई है।` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'सर्वर एरर: ' + error.message });
  }
});

// 5. यूजर बैन टूल और मैन्युअल कॉइन जोड़ने/काटने का टूल [BAN USER]
app.post('/api/admin/user-control', async (req, res) => {
  const { uid, action, amount } = req.body; // action: 'BAN' | 'UNBAN' | 'ADD_COIN' | 'DEDUCT_COIN'

  try {
    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ success: false, message: 'यूजर नहीं मिला!' });

    const generatedTxnId = 'ADM' + crypto.randomBytes(4).toString('hex').toUpperCase();

    if (action === 'BAN') {
      user.isBanned = true; // इसके बाद यूजर ऐप में लॉगिन नहीं कर पाएगा
    } else if (action === 'UNBAN') {
      user.isBanned = false;
    } else if (action === 'ADD_COIN') {
      user.alphaCoins += Number(amount);
      // पासबुक में एंट्री ट्रैक करने के लिए रिकॉर्ड सेव करें
      const logTxn = new Transaction({ txnId: generatedTxnId, senderId: 'ADMIN', receiverId: uid, amount: Number(amount), type: 'P2P_Receive', status: 'Success' });
      await logTxn.save();
    } else if (action === 'DEDUCT_COIN') {
      user.alphaCoins -= Number(amount);
      const logTxn = new Transaction({ txnId: generatedTxnId, senderId: uid, receiverId: 'ADMIN', amount: Number(amount), type: 'P2P_Send', status: 'Success' });
      await logTxn.save();
    } else {
      return res.status(400).json({ success: false, message: 'गलत कमांड!' });
    }

    await user.save();
    res.status(200).json({ success: true, message: `एडमिन एक्शन [${action}] सफल रहा!`, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'सर्वर एरर: ' + error.message });
  }
});
// ==========================================
// STEP 7.5: लाइव सेटिंग्स, विज्ञापन और अलर्ट ब्रॉडकास्ट APIs
// ==========================================
const AdminSetting = require('./models/AdminSetting'); // एडमिन सेटिंग मॉडल

// 1. CPanel से लाइव बैंक, UPI और QR कोड (ImgBB लिंक) अपडेट करने की API
app.post('/api/admin/update-payment-settings', async (req, res) => {
  const { bankName, accountNumber, ifscCode, accountHolder, companyUpiId, companyQrCodeUrl } = req.body;

  try {
    // डेटाबेस में पहली सेटिंग को ढूंढे, नहीं तो नई बनाएँ (Upsert)
    const settings = await AdminSetting.findOneAndUpdate(
      {},
      {
        companyBankDetails: { bankName, accountNumber, ifscCode, accountHolder },
        companyUpiId,
        companyQrCodeUrl
      },
      { new: true, upsert: true }
    );

    res.status(200).json({ success: true, message: 'पेमेंट डिटेल्स लाइव अपडेट कर दी गई हैं!', settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'सर्वर एरर: ' + error.message });
  }
});

// 2. AdMob बैनर एड यूनिट आईडी लाइव बदलने की API
app.post('/api/admin/update-ad-settings', async (req, res) => {
  const { bannerAdUnitId } = req.body;

  try {
    const settings = await AdminSetting.findOneAndUpdate(
      {},
      { bannerAdUnitId },
      { new: true, upsert: true }
    );

    res.status(200).json({ success: true, message: 'AdMob बैनर आईडी लाइव बदल दी गई है!', settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'सर्ver एरर' });
  }
});

// 3. यूजर ऐप के 'Alert' पेज पर दिखने वाला ग्लोबल नोटिस/लाइव मैसेज (App Alert Broadcast)
// हम इसे आसान रखने के लिए एक ग्लोबल वेरिएबल या एडमिन सेटिंग में ही स्टोर कर लेते हैं
let globalAppAlert = { message: "सेंट्रल वॉलेट में आपका स्वागत है!", timestamp: new Date() };

app.post('/api/admin/broadcast-alert', (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ success: false, message: 'मेसेज खाली नहीं हो सकता!' });

  globalAppAlert = {
    message,
    timestamp: new Date()
  };

  res.status(200).json({ success: true, message: 'ग्लोबल अलर्ट ऐप पर लाइव भेज दिया गया है!' });
});

// 4. यूजर ऐप द्वारा लाइव सेटिंग्स और अलर्ट नोटिस फेच करने की API (यह ऐप के होम डैशबोर्ड पर काम आएगी)
app.get('/api/app/live-config', async (req, res) => {
  try {
    const settings = await AdminSetting.findOne({});
    res.status(200).json({
      success: true,
      alertNotice: globalAppAlert.message,
      companyUpiId: settings?.companyUpiId || "",
      companyQrCodeUrl: settings?.companyQrCodeUrl || "",
      companyBankDetails: settings?.companyBankDetails || {},
      bannerAdUnitId: settings?.bannerAdUnitId || ""
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// ==========================================
// STEP 7: सर्वर चालू करने का कोड (हमेशा सबसे नीचे)
// ==========================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
