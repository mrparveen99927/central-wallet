const mongoose = require('mongoose');

// 📥 📤 विड्रॉल और डिपॉजिट रिकॉर्ड्स सुरक्षित रखने का मास्टर ढांचा
const TransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userUidId: { type: String, required: true, trim: true },
    transactionType: { type: String, enum: ['DEPOSIT', 'WITHDRAWAL'], required: true },
    amount: { type: Number, required: true },
    utrNumber: { type: String, trim: true, default: null },
    paymentMethod: { type: String, required: true }
          status: { type: String, enum: ['PENDING', 'SUCCESS', 'DECLINED'], default: 'PENDING' },
    paymentDetails: { type: String, default: null }
}, { timestamps: true });

// पूरे सर्वर में इस्तेमाल करने के लिए ट्रांजैक्शन मॉडल को एक्सポート करना
module.exports = mongoose.model('Transaction', TransactionSchema);

