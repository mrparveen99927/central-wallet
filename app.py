from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient

app = Flask(__name__)
CORS(app)

# 🔑 आपका MongoDB कनेक्शन लिंक
MONGO_URI = "mongodb+srv://erparveen01027_db_user:MNwWnUMVC5UnXZrk@cluster0.pluvfcd.mongodb.net/?appName=Cluster0"

try:
    client = MongoClient(MONGO_URI)
    db = client['central_wallet_db']
    users_collection = db['users']
    transactions_collection = db['transactions']
    print("✅ MongoDB Cloud Database Connected Successfully!")
except Exception as e:
    print(f"❌ Database Connection Error: {e}")

@app.route('/')
def home():
    return "🔮 N&N Token Platform Backend Server is Running Live!"

# 👤 1. नया अकाउंट + 30 N&N साइन-अप बोनस + 50 N&N रेफरल बोनस लॉजिक
@app.route('/api/register', methods=['POST'])
def register_user():
    data = request.json
    name = data.get('name')
    mobile = data.get('mobile')
    mpin = data.get('mpin')
    referred_by = data.get('referred_by') # दोस्त का नंबर जिसने इनवाइट किया

    if not name or not mobile or not mpin:
        return jsonify({"status": "error", "message": "All fields are required!"}), 400

    # चेक करना कि नंबर पहले से रजिस्टर्ड तो नहीं है
    existing_user = users_collection.find_one({"mobile": mobile})
    if existing_user:
        return jsonify({"status": "error", "message": "❌ This Mobile Number is already registered!"}), 400

    # 🎁 नया नियम: हर नए यूजर को पहली बार में सीधा 30 N&N टोकन्स का फ्री बोनस मिलेगा
    new_user = {
        "name": name,
        "mobile": mobile,
        "mpin": mpin,
        "balance": 30.0 # यहाँ 30 टोकन फिक्स कर दिए हैं
    }
    users_collection.insert_one(new_user)

    # 🎁 नया नियम: अगर यूजर किसी के रेफरल लिंक/नंबर से आया है, तो इनवाइट करने वाले को 50 N&N मिलेंगे
    if referred_by and len(referred_by) == 10:
        referrer = users_collection.find_one({"mobile": referred_by})
        if referrer:
            # इनवाइट करने वाले के अकाउंट में 50 टोकन जोड़ना
            users_collection.update_one({"mobile": referred_by}, {"$inc": {"balance": 50.0}})
            
            # ट्रांजैक्शन हिस्ट्री में रेफरल का रिकॉर्ड सेव करना
            transactions_collection.insert_one({
                "sender": "SYSTEM_BONUS",
                "receiver": referred_by,
                "amount": 50.0,
                "type": "referral_reward",
                "note": f"Earned from inviting {name}"
            })

    return jsonify({"status": "success", "message": "🎉 Account Created! 30 N&N Tokens Sign-up Bonus Credited."})

# 🔑 2. लॉगिन करने का लॉजिक
@app.route('/api/login', methods=['POST'])
def login_user():
    data = request.json
    mobile = data.get('mobile')
    mpin = data.get('mpin')

    user = users_collection.find_one({"mobile": mobile, "mpin": mpin})
    if user:
        return jsonify({
            "status": "success", 
            "message": "Welcome Back!",
            "user": {"name": user['name'], "mobile": user['mobile'], "balance": user['balance']}
        })
    else:
        return jsonify({"status": "error", "message": "❌ Invalid Mobile or MPIN!"}), 401

# 🔄 3. वॉलेट-टू-वॉलेट ट्रांसफर लॉजिक (To Mobile Number)
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

    if not sender:
        return jsonify({"status": "error", "message": "Sender account not found!"}), 404
    if not receiver:
        return jsonify({"status": "error", "message": "❌ Receiver is not an N&N User!"}), 404

    if sender['balance'] < amount:
        return jsonify({"status": "error", "message": "❌ Insufficient N&N Tokens Balance!"}), 400

    users_collection.update_one({"mobile": sender_mobile}, {"$inc": {"balance": -amount}})
    users_collection.update_one({"mobile": receiver_mobile}, {"$inc": {"balance": amount}})

    transactions_collection.insert_one({
        "sender": sender_mobile,
        "receiver": receiver_mobile,
        "amount": amount,
        "type": "wallet_transfer"
    })

    return jsonify({"status": "success", "message": f"✅ Successfully sent {amount} N&N Tokens!"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)

# ----------------- 5. POWERFUL CPANEL LOGIC -----------------

# एडमिन लॉगिन सुरक्षा (आप अपना पासवर्ड यहाँ बदल सकते हैं)
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "SuperSecretPassword123" # इसे बदल लें

# एडमिन सेटिंग्स के लिए मोंगोडीबी में एक नया कलेक्शन
settings_collection = db['gateway_settings']

# डिफ़ॉल्ट सेटिंग्स सेट करना (यदि डेटाबेस में न हो)
if not settings_collection.find_one({"type": "global_config"}):
    settings_collection.insert_one({
        "type": "global_config",
        "transfer_fee_percent": 3.0,
        "ads_enabled": True
    })

# A. एडमिन लॉगिन API
@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
        return jsonify({"success": True, "token": "SECURE_ADMIN_SESSION_TOKEN"})
    return jsonify({"success": False, "message": "गलत एडमिन क्रेडेंशियल्स!"}), 401

# B. लाइव डैशबोर्ड स्टेट्स (कुल डिपॉजिट, विड्रॉल और फीस कमाई)
@app.route('/api/admin/dashboard-stats', methods=['GET'])
def get_stats():
    total_users = users_collection.count_documents({})
    pending_utr = transactions_collection.count_documents({"status": "Pending"})
    
    # ग्लोबल कॉन्फ़िगरेशन निकालें
    config = settings_collection.find_one({"type": "global_config"})
    
    return jsonify({
        "success": True,
        "totalUsers": total_users,
        "pendingUtrCount": pending_utr,
        "currentFee": config.get('transfer_fee_percent', 3.0),
        "adsStatus": config.get('ads_enabled', True)
    })

# C. गेटवे रिमोट कंट्रोल्स (फीस बदलना और विज्ञापन ऑन/ऑफ करना)
@app.route('/api/admin/update-settings', methods=['POST'])
def update_settings():
    data = request.json
    fee = data.get('fee')
    ads = data.get('ads') # True या False
    
    update_data = {}
    if fee is not None: update_data["transfer_fee_percent"] = float(fee)
    if ads is not None: update_data["ads_enabled"] = bool(ads)
    
    settings_collection.update_one({"type": "global_config"}, {"$set": update_data})
    return jsonify({"success": True, "message": "गेटवे सेटिंग्स सफलतापूर्वक अपडेट हो गई हैं!"})

# D. यूजर मैनेजमेंट (मैन्युअल गिफ्ट कॉइन्स देना या डिवाइस अनलॉक करना)
@app.route('/api/admin/control-user', methods=['POST'])
def control_user():
    data = request.json
    mobile = data.get('mobileNumber')
    action = data.get('action') # 'gift' या 'unlock_device'
    amount = data.get('amount', 0)
    
    user = users_collection.find_one({"mobileNumber": mobile})
    if not user:
        return jsonify({"success": False, "message": "यूज़र नहीं मिला!"}), 404
        
    if action == 'gift':
        users_collection.update_one({"mobileNumber": mobile}, {"$inc": {"balance": float(amount)}})
        return jsonify({"success": True, "message": f"यूज़र को {amount} गिफ्ट कॉइन्स दे दिए गए हैं!"})
        
    elif action == 'unlock_device':
        users_collection.update_one({"mobileNumber": mobile}, {"$set": {"device_id": None}})
        return jsonify({"success": True, "message": "यूज़र का डिवाइस लॉक हटा दिया गया है!"})
