import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../models/User.js";

function getArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((val) => val.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

async function run() {
  const email = getArg("email");
  const password = getArg("password");

  if (!email || !password) {
    console.error("Usage: node src/scripts/resetPassword.js --email=you@example.com --password=NewPass123");
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const hash = await bcrypt.hash(password, 10);
  const res = await User.updateOne({ email }, { $set: { passwordHash: hash } });
  console.log(JSON.stringify({ matched: res.matchedCount, modified: res.modifiedCount }));
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
