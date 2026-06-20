import os
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from bson.objectid import ObjectId

app = Flask(__name__)
CORS(app)

# 🔐 मोंगोडीबी कनेक्शन (इसे एक ही लाइन में रखें)
MONGO_URI = "mongodb+srv://erparveen01027_db_user:MNwwnUMVC5UnXZrk@cluster0.pluvfcd.mongodb.net/?appName=Cluster0"

client = MongoClient(MONGO_URI)
db = client['central_wallet_db']
users_collection = db['users']
transactions_collection = db['transactions']
settings_collection = db['gateway_settings']

@app.route('/')
def home():
    return "N&N Network Wallet Gateway Server is Running Live!"

# 👤 1. रजिस्ट्रेशन + 30 N&N साइनअप बोनस + 50 N&N रेफरल बोनस
@app.route('/api/register', methods=['POST'])
def register_user():
    data = request.json
    name = data.get('name')
    mobile = data.get('mobile')
    mpin = data.get('mpin')
    referred_by = data.get('referred_by')

    if not name or not mobile or not mpin:
        return jsonify({"status": "error", "message": "Fields required!"}), 400

    if users_collection.find_one({"mobile": mobile}):
        return jsonify({"status": "error", "message": "Already registered!"}), 400

    new_user = {
        "name": name,
        "mobile": mobile,
        "mpin": mpin,
        "balance": 30.0,
        "device_id": None,
        "createdAt": datetime.utcnow()
    }
    users_collection.insert_one(new_user)

    if referred_by and len(referred_by) == 10:
        referrer = users_collection.find_one({"mobile": referred_by})
        if referrer:
            users_collection.update_one({"mobile": referred_by}, {"$inc": {"balance": 50.0}})
            transactions_collection.insert_one({
                "sender": "SYSTEM_BONUS",
                "receiver": referred_by,
                "amount": 50.0,
                "type": "referral_reward",
                "note": f"Invited {name}",
                "createdAt": datetime.utcnow()
            })

    return jsonify({"status": "success", "message": "Registered! 30 Bonus Added."})

# 🔐 2. लॉगिन लॉजिक
@app.route('/api/login', methods=['POST'])
def login_user():
    data = request.json
    mobile = data.get('mobile')
    mpin = data.get('mpin')
    
    user = users_collection.find_one({"mobile": mobile, "mpin": mpin})
    if user:
        return jsonify({
            "status": "success",
            "message": "Welcome!",
            "user": {
                "userId": str(user['_id']),
                "name": user['name'],
                "mobile": user['mobile'],
                "balance": user.get('balance', 30.0)
            }
        })
    return jsonify({"status": "error", "message": "Invalid Login!"}), 401

# 🔄 3. वॉलेट-टू-वॉलेट ट्रांसफर (P2P Transfer)
@app.route('/api/transfer', methods=['POST'])
def transfer_coins():
    data = request.json
    sender_mobile = data.get('sender_mobile')
    receiver_mobile = data.get('receiver_mobile')
    amount = float(data.get('amount', 0))
    
    if amount <= 0:
        return jsonify({"status": "error", "message": "Invalid Amount!"}), 400
        
    sender = users_collection.find_one({"mobile": sender_mobile})
    receiver = users_collection.find_one({"mobile": receiver_mobile})
    
    if not sender or not receiver:
        return jsonify({"status": "error", "message": "User not found!"}), 404
        
    if sender.get('balance', 30.0) < amount:
        return jsonify({"status": "error", "message": "Insufficient Balance!"}), 400

    users_collection.update_one({"mobile": sender_mobile}, {"$inc": {"balance": -amount}})
    users_collection.update_one({"mobile": receiver_mobile}, {"$inc": {"balance": amount}})

    transactions_collection.insert_one({
        "sender": sender_mobile,
        "receiver": receiver_mobile,
        "amount": amount,
        "type": "wallet_transfer",
        "createdAt": datetime.utcnow()
    })
    return jsonify({"status": "success", "message": "Coins transferred!"})

# 📥 4. बैंक क्यूआर से टोकन ऐड करना (Add Tokens Request)
@app.route('/api/wallet/add-tokens', methods=['POST'])
def add_tokens():
    data = request.json
    user_id = data.get('userId')
    utr_number = data.get('utrNumber')
    amount = data.get('amount')

    if transactions_collection.find_one({"utrNumber": utr_number}):
        return jsonify({"success": False, "message": "UTR already used!"}), 400

    transactions_collection.insert_one({
        "userId": ObjectId(user_id),
        "utrNumber": utr_number,
        "amount": float(amount),
        "status": "Pending",
        "createdAt": datetime.utcnow()
    })
    return jsonify({"success": True, "message": "UTR submitted!"})

# 🛠️ 5. CPANEL / ADMIN LOGIC
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "SuperSecretPassword123"

if not settings_collection.find_one({"type": "global_config"}):
    settings_collection.insert_one({"type": "global_config", "transfer_fee_percent": 3.0, "ads_enabled": True})

@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.json
    if data.get('username') == ADMIN_USERNAME and data.get('password') == ADMIN_PASSWORD:
        return jsonify({"success": True, "token": "ADMIN_TOKEN"})
    return jsonify({"success": False, "message": "Wrong credentials!"}), 401

@app.route('/api/admin/dashboard-stats', methods=['GET'])
def get_stats():
    total_users = users_collection.count_documents({})
    pending_utr = transactions_collection.count_documents({"status": "Pending"})
    config = settings_collection.find_one({"type": "global_config"}) or {}
    return jsonify({
        "success": True, 
        "totalUsers": total_users, 
        "pendingUtrCount": pending_utr,
        "currentFee": config.get('transfer_fee_percent', 3.0), 
        "adsStatus": config.get('ads_enabled', True)
    })

@app.route('/api/admin/pending-utr', methods=['GET'])
def get_pending_utr():
    pending_txns = list(transactions_collection.find({"status": "Pending"}))
    output = [{"_id": str(txn['_id']), "userId": str(txn['userId']), "utrNumber": txn['utrNumber'], "amount": txn['amount']} for txn in pending_txns]
    return jsonify({"success": True, "transactions": output})

@app.route('/api/admin/process-utr', methods=['POST'])
def process_utr():
    data = request.json
    txn_id, status = data.get('txnId'), data.get('status')
    txn = transactions_collection.find_one({"_id": ObjectId(txn_id), "status": "Pending"})
    if not txn:
        return jsonify({"success": False, "message": "Not found!"})
    if status == "Success":
        users_collection.update_one({"_id": txn['userId']}, {"$inc": {"balance": float(txn['amount'])}})
    transactions_collection.update_one({"_id": ObjectId(txn_id)}, {"$set": {"status": status}})
    return jsonify({"success": True, "message": "Processed successfully!"})

@app.route('/api/admin/control-user', methods=['POST'])
def control_user():
    data = request.json
    mobile, action, amount = data.get('mobileNumber'), data.get('action'), float(data.get('amount', 0))
    if action == 'gift':
        users_collection.update_one({"mobile": mobile}, {"$inc": {"balance": amount}})
        return jsonify({"success": True, "message": "Gift credited!"})
    elif action == 'unlock_device':
        users_collection.update_one({"mobile": mobile}, {"$set": {"device_id": None}})
        return jsonify({"success": True, "message": "Device unlocked!"})
    return jsonify({"success": False, "message": "Invalid action"}), 400

# 🚀 पायथन स्टार्ट इंजन (हमेशा फ़ाइल के सबसे अंत में)
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
