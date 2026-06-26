const mongoose = require('mongoose');

const SupportTicketSchema = new mongoose.Schema({
  ticketId: { type: String, required: true, unique: true }, // जैसे: TKT1001
  userId: { type: String, required: true }, // शिकायत करने वाले की UID
  category: { 
    type: String, 
    required: true, 
    enum: ['Deposit', 'Withdrawal', 'Technical Bug'] 
  },
  message: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['Open', 'Resolved'], 
    default: 'Open' 
  }
}, { timestamps: true });

module.exports = mongoose.model('SupportTicket', SupportTicketSchema);
