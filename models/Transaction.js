const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  txnId: { type: String, required: true, unique: true }, // ऑटो-जनरेटेड यूनिक आईडी
  senderId: { type: String, required: true }, // CW1001, 'BANK', 'GAME' आदि
  receiverId: { type: String, required: true }, // CW1002, 'BANK', 'GAME' आदि
  amount: { type: Number, required: true }, // रकम या कॉइन्स की संख्या
  type: { 
    type: String, 
    required: true,
    enum: ['Deposit', 'Withdrawal', 'Wallet_to_Game', 'Game_to_Wallet', 'P2P_Send', 'P2P_Receive'] 
  },
  utrNumber: { type: String, default: null, sparse: true }, // डुप्लीकेट UTR ब्लॉक सुरक्षा के लिए
  status: { 
    type: String, 
    enum: ['Pending', 'Success', 'Failed'], 
    default: 'Pending' 
  },
  timestamp: { type: Date, default: Date.now } // तारीख और सही समय
});

module.exports = mongoose.model('Transaction', TransactionSchema);
