from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient

app = Flask(__name__)
CORS(app) # ताकि फ्रंटएंड और बैकएंड आपस में बात कर सकें

# 🔑 आपका MongoDB कनेक्शन लिंक (जो हमने स्टेप 1 में लाइव बनाया था)
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
    return "🔮 Central Wallet Backend Server is Running Live!"

# 👤 1. नया अकाउंट बनाने का लॉजिक (रजिस्ट्रेशन)
@app.route('/api/register', methods=['POST'])
def register_user():
    data = request.json
    name = data.get('name')
    mobile = data.get('mobile')
    mpin = data.get('mpin')

    if not name or not mobile or not mpin:
        return jsonify({"status": "error", "message": "All fields are required!"}), 400

    # चेक करना कि एक नंबर से एक ही आईडी बने
    existing_user = users_collection.find_one({"mobile": mobile})
    if existing_user:
        return jsonify({"status": "error", "message": "❌ This Mobile Number is already registered!"}), 400

    # नया यूजर डेटाबेस में डालना (शुरुआती बैलेंस = 500 कॉइन टेस्ट के लिए)
    new_user = {
        "name": name,
        "mobile": mobile,
        "mpin": mpin,
        "balance": 500.0
    }
    users_collection.insert_one(new_user)
    return jsonify({"status": "success", "message": "🎉 Wallet Created Successfully!"})

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
        return jsonify({"status": "error", "message": "❌ Receiver is not a Central Wallet User!"}), 404

    # चेक करना कि भेजने वाले के पास पर्याप्त बैलेंस है या नहीं
    if sender['balance'] < amount:
        return jsonify({"status": "error", "message": "❌ Insufficient Wallet Balance!"}), 400

    # डेटाबेस में कॉइन्स का अदला-बदली (ऑटोमैटिक)
    users_collection.update_one({"mobile": sender_mobile}, {"$inc": {"balance": -amount}})
    users_collection.update_one({"mobile": receiver_mobile}, {"$inc": {"balance": amount}})

    # ट्रांजैक्शन हिस्ट्री में रिकॉर्ड सेव करना
    txn_log = {
        "sender": sender_mobile,
        "receiver": receiver_mobile,
        "amount": amount,
        "type": "wallet_transfer"
    }
    transactions_collection.insert_one(txn_log)

    return jsonify({"status": "success", "message": f"✅ Successfully sent {amount} coins!"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
