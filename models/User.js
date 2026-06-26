const mongoose = require('mongoose');

// 🍃 मोंगोडीबी डेटाबेस के लिए यूज़र का मास्टर ढांचा (Schema)
const UserSchema = new mongoose.Schema({
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    mobileNumber: { type: String, required: true, unique: true, trim: true },
    gmailId: { type: String, required: true, unique: true, lowercase: true, trim: true },
    loginPassword: { type: String, required: true },
    userUidId: { type: String, required: true, unique: true, trim: true },
    walletUpiAnchor: { type: String, required: true, unique: true, trim: true }
          alphaCoinsBalance: { type: Number, default: 0.00 },
    realMoneyBalance: { type: Number, default: 0.00 },
    isAccountBanned: { type: Boolean, default: false },
    accountCreatedOn: { type: Date, default: Date.now }
}, { timestamps: true });

// पूरे प्रोजेक्ट में इस्तेमाल करने के लिए मॉडल को एक्सपोर्ट करना
module.exports = mongoose.model('User', UserSchema);

