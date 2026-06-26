const mongoose = require('mongoose');

const AdminSettingSchema = new mongoose.Schema({
  adminUsername: { type: String, required: true, default: 'admin' },
  adminPassword: { type: String, required: true }, // Cpanel लॉगिन पासवर्ड
  companyBankDetails: {
    bankName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    accountHolder: { type: String, default: '' }
  },
  companyUpiId: { type: String, default: '' }, // एडमिन की लाइव UPI आईडी
  companyQrCodeUrl: { type: String, default: '' }, // ImgBB से आने वाला लाइव QR लिंक
  minGameTransferLimit: { type: Number, default: 100 },
  maxGameTransferLimit: { type: Number, default: 50000 },
  bannerAdUnitId: { type: String, default: '' } // Google AdMob ID लिंक
}, { timestamps: true });

module.exports = mongoose.model('AdminSetting', AdminSettingSchema);
