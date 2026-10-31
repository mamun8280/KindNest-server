import express from "express";
import cors from "cors";
import { MongoClient } from 'mongodb';
import 'dotenv/config'



const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
    throw err;
  }
}






app.get('/', (req, res) => {
  res.send('KindNest server is fine!')
})

app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`)
})