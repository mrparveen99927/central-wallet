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
