// ==========================================
// STEP 1:    (Imports)
// ==========================================
require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

//   
const User = require('./models/User');
const Transaction = require('./models/Transaction'); 
const AdminSetting = require('./models/AdminSetting'); 

const app = express();

// ==========================================
// STEP 2:  (Middlewares)
// ==========================================
app.use(cors());
app.use(express.json());

// ==========================================
// STEP 3:   (MongoDB Atlas)
// ==========================================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('SUCCESS: MongoDB Atlas     !'))
  .catch((err) => console.log('ERROR:  :', err.message));

// ==========================================
// STEP 4:   
// ==========================================
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Central Wallet Backend Engine is Running Live! '
  });
});
// ==========================================
// STEP 5:   (SIGN UP) API
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  const { firstName, lastName, mobile, email, password, referredBy } = req.body;
  try {
    const userExists = await User.findOne({ $or: [{ mobile }, { email }] });
    if (userExists) {
      return res.status(400).json({ success: false, message: '       !' });
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
      message: '  !',
      data: { uid: generatedUid, upiId: generatedUpi, referralCode: generatedReferral }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: ' : ' + error.message });
  }
});
// ==========================================
// STEP 6:   (LOGIN) API
// ==========================================
app.post('/api/auth/login', async (req, res) => {
  const { loginId, password } = req.body;
  try {
    const user = await User.findOne({
      $or: [{ uid: loginId }, { mobile: loginId }, { email: loginId }]
    });
    if (!user) {
      return res.status(400).json({ success: false, message: '   !' });
    }
    if (user.isBanned) {
      return res.status(403).json({ success: false, message: '      !' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: ' !' });
    }
    const token = jwt.sign(
      { id: user._id, uid: user.uid },
      process.env.JWT_SECRET || 'CentralWalletSuperSecretKey2026',
      { expiresIn: '30d' }
    );
    res.status(200).json({
      success: true,
      message: '  !',
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
    res.status(500).json({ success: false, message: ' : ' + error.message });
  }
});

// ==========================================
// STEP 6.5:      (Wallet to Game)
// ==========================================
app.post('/api/game/deposit', async (req, res) => {
  const { uid, amount, secretToken } = req.body;
  if (!secretToken || secretToken !== process.env.GAME_SECRET_TOKEN) {
    return res.status(401).json({ success: false, message: ' !    ' });
  }
  const coinAmount = Number(amount);
  if (isNaN(coinAmount) || coinAmount <= 0) {
    return res.status(400).json({ success: false, message: '     !' });
  }
  try {
    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ success: false, message: '  !' });
    if (user.isBanned) return res.status(403).json({ success: false, message: '   !' });
    if (user.alphaCoins < coinAmount) {
      return res.status(400).json({ success: false, message: '   Alpha Coins  !' });
    }
    user.alphaCoins -= coinAmount;
    await user.save();
    
    const generatedTxnId = 'TXN' + crypto.randomBytes(4).toString('hex').toUpperCase();
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
      message: '       !',
      txnId: generatedTxnId,
      remainingCoins: user.alphaCoins
    });
  } catch (error) {
    res.status(500).json({ success: false, message: ' : ' + error.message });
  }
});
app.post('/api/game/withdraw', async (req, res) => {
  const { uid, amount, secretToken } = req.body;
  if (!secretToken || secretToken !== process.env.GAME_SECRET_TOKEN) {
    return res.status(401).json({ success: false, message: ' !    ' });
  }
  const coinAmount = Number(amount);
  if (isNaN(coinAmount) || coinAmount <= 0) {
    return res.status(400).json({ success: false, message: '     !' });
  }
  try {
    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ success: false, message: '  !' });
    if (user.isBanned) return res.status(403).json({ success: false, message: '   !' });
    
    user.alphaCoins += coinAmount;
    await user.save();
    
    const generatedTxnId = 'TXN' + crypto.randomBytes(4).toString('hex').toUpperCase();
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
      message: '          !',
      txnId: generatedTxnId,
      totalCoins: user.alphaCoins
    });
  } catch (error) {
    res.status(500).json({ success: false, message: ' : ' + error.message });
  }
});

// ==========================================
// STEP 6.6: ,    
// ==========================================
app.post('/api/wallet/deposit-request', async (req, res) => {
  const { uid, amount, utrNumber } = req.body;
  if (!uid || !amount || !utrNumber) {
    return res.status(400).json({ success: false, message: '    (UID, Amount, UTR) !' });
  }
  if (utrNumber.trim().length !== 12) {
    return res.status(400).json({ success: false, message: '  12-  UTR   !' });
  }
  try {
    const utrExists = await Transaction.findOne({ utrNumber: utrNumber.trim() });
    if (utrExists) {
      return res.status(400).json({ success: false, message: ' UTR        !   ' });
    }
    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ success: false, message: '  !' });
    
    const generatedTxnId = 'DEP' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const depositTxn = new Transaction({
      txnId: generatedTxnId,
      senderId: 'BANK',
      receiverId: uid,
      amount: Number(amount),
      type: 'Deposit',
      utrNumber: utrNumber.trim(),
      status: 'Pending'
    });
    await depositTxn.save();
    res.status(201).json({
      success: true,
      message: '      !      ',
      txnId: generatedTxnId
    });
  } catch (error) {
    res.status(500).json({ success: false, message: ' : ' + error.message });
  }
});
app.post('/api/wallet/withdraw-request', async (req, res) => {
  const { uid, amount } = req.body;
  const withdrawAmount = Number(amount);
  if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
    return res.status(400).json({ success: false, message: '    !' });
  }
  try {
    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ success: false, message: '  !' });
    if (user.alphaCoins < withdrawAmount) {
      return res.status(400).json({ success: false, message: '         !' });
    }
    user.alphaCoins -= withdrawAmount;
    await user.save();
    
    const generatedTxnId = 'WTH' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const withdrawTxn = new Transaction({
      txnId: generatedTxnId,
      senderId: uid,
      receiverId: 'BANK',
      amount: withdrawAmount,
      type: 'Withdrawal',
      status: 'Pending'
    });
    await withdrawTxn.save();
    res.status(201).json({
      success: true,
      message: '     !         ',
      txnId: generatedTxnId,
      remainingCoins: user.alphaCoins
    });
  } catch (error) {
    res.status(500).json({ success: false, message: ' : ' + error.message });
  }
});

app.post('/api/wallet/convert', async (req, res) => {
  const { uid, coinAmount, mpin } = req.body;
  const coinsToConvert = Number(coinAmount);
  if (isNaN(coinsToConvert) || coinsToConvert <= 0) {
    return res.status(400).json({ success: false, message: '    !' });
  }
  try {
    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ success: false, message: '  !' });
    if (!user.mpin || user.mpin !== mpin) {
      return res.status(400).json({ success: false, message: '  MPIN!    ' });
    }
    if (user.alphaCoins < coinsToConvert) {
      return res.status(400).json({ success: false, message: '     Alpha Coins  !' });
    }
    const convertedAmount = coinsToConvert * 1;
    user.alphaCoins -= coinsToConvert;
    user.realMoneyBalance += convertedAmount;
    await user.save();
    
    res.status(200).json({
      success: true,
      message: ` ${coinsToConvert}   ${convertedAmount}       !`,
      alphaCoins: user.alphaCoins,
      realMoneyBalance: user.realMoneyBalance
    });
  } catch (error) {
    res.status(500).json({ success: false, message: ' : ' + error.message });
  }
});

// ==========================================
// STEP 7:  CPANEL    APIs
// ==========================================
app.get('/api/admin/dashboard-summary', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayNewUsers = await User.countDocuments({ createdAt: { $gte: startOfToday } });
    
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
    res.status(500).json({ success: false, message: ' : ' + error.message });
  }
});

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
    const users = await User.find(query).sort({ createdAt: -1 });
    res.status(200).json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: ' : ' + error.message });
  }
});
app.post('/api/admin/deposit/process', async (req, res) => {
  const { txnId, action } = req.body;
  try {
    const txn = await Transaction.findOne({ txnId, type: 'Deposit' });
    if (!txn) return res.status(404).json({ success: false, message: '    !' });
    if (txn.status !== 'Pending') return res.status(400).json({ success: false, message: '       !' });
    const user = await User.findOne({ uid: txn.receiverId });
    if (!user) return res.status(404).json({ success: false, message: '  !' });
    
    if (action === 'Approve') {
      user.alphaCoins += txn.amount;
      await user.save();
      txn.status = 'Success';
    } else if (action === 'Decline') {
      txn.status = 'Failed';
    } else {
      return res.status(400).json({ success: false, message: ' !  Approve  Decline ' });
    }
    await txn.save();
    res.status(200).json({ success: true, message: `   ${action}    ` });
  } catch (error) {
    res.status(500).json({ success: false, message: ' : ' + error.message });
  }
});

app.post('/api/admin/withdrawal/process', async (req, res) => {
  const { txnId, action } = req.body;
  try {
    const txn = await Transaction.findOne({ txnId, type: 'Withdrawal' });
    if (!txn) return res.status(404).json({ success: false, message: '    !' });
    if (txn.status !== 'Pending') return res.status(400).json({ success: false, message: '       !' });
    const user = await User.findOne({ uid: txn.senderId });
    if (!user) return res.status(404).json({ success: false, message: '  !' });
    
    if (action === 'Approve') {
      txn.status = 'Success';
    } else if (action === 'Decline') {
      user.alphaCoins += txn.amount;
      await user.save();
      txn.status = 'Failed';
    } else {
      return res.status(400).json({ success: false, message: ' !' });
    }
    await txn.save();
    res.status(200).json({ success: true, message: `   ${action}    ` });
  } catch (error) {
    res.status(500).json({ success: false, message: ' : ' + error.message });
  }
});

app.post('/api/admin/user-control', async (req, res) => {
  const { uid, action, amount } = req.body;
  try {
    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ success: false, message: '  !' });
    const generatedTxnId = 'ADM' + crypto.randomBytes(4).toString('hex').toUpperCase();
    
    if (action === 'BAN') {
      user.isBanned = true;
    } else if (action === 'UNBAN') {
      user.isBanned = false;
    } else if (action === 'ADD_COIN') {
      user.alphaCoins += Number(amount);
      const logTxn = new Transaction({ txnId: generatedTxnId, senderId: 'ADMIN', receiverId: uid, amount: Number(amount), type: 'P2P_Receive', status: 'Success' });
      await logTxn.save();
    } else if (action === 'DEDUCT_COIN') {
      user.alphaCoins -= Number(amount);
      const logTxn = new Transaction({ txnId: generatedTxnId, senderId: uid, receiverId: 'ADMIN', amount: Number(amount), type: 'P2P_Send', status: 'Success' });
      await logTxn.save();
    } else {
      return res.status(400).json({ success: false, message: ' !' });
    }
    await user.save();
    res.status(200).json({ success: true, message: `  [${action}]  !`, user });
  } catch (error) {
    res.status(500).json({ success: false, message: ' : ' + error.message });
  }
});

app.post('/api/admin/update-payment-settings', async (req, res) => {
  const { bankName, accountNumber, ifscCode, accountHolder, companyUpiId, companyQrCodeUrl } = req.body;
  try {
    const settings = await AdminSetting.findOneAndUpdate(
      {},
      { companyBankDetails: { bankName, accountNumber, ifscCode, accountHolder }, companyUpiId, companyQrCodeUrl },
      { new: true, upsert: true }
    );
    res.status(200).json({ success: true, message: '       !', settings });
  } catch (error) {
    res.status(500).json({ success: false, message: ' : ' + error.message });
  }
});

app.post('/api/admin/update-ad-settings', async (req, res) => {
  const { bannerAdUnitId } = req.body;
  try {
    const settings = await AdminSetting.findOneAndUpdate(
      {},
      { bannerAdUnitId },
      { new: true, upsert: true }
    );
    res.status(200).json({ success: true, message: 'AdMob       !', settings });
  } catch (error) {
    res.status(500).json({ success: false, message: ' ' });
  }
});

let globalAppAlert = { message: "     !", timestamp: new Date() };

app.post('/api/admin/broadcast-alert', (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ success: false, message: '    !' });
  globalAppAlert = { message, timestamp: new Date() };
  res.status(200).json({ success: true, message: '        !' });
});

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
// STEP 8:      ( )
// ==========================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
