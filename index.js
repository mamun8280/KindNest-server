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
const mongoclient = await connectToMongoDB();
const db = mongoclient.db("kindnest");
const ManageEventcollection = db.collection("ManageEvents");
// Create Event
app.post("/create-event", async (req, res) => {
  try {
    console.log("Received Data:", req.body);
    const data = req.body;
    const result = await ManageEventcollection.insertOne(data);
    console.log("MongoDB Insert Result:", result);
    res.status(201).send({
      success: true,
      message: "Event created successfully!",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("MongoDB Insert Error:", error);

    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});

app.get("/ManageEvents", async (req, res) => {
  try {
    const events = await ManageEventcollection.find().toArray();

    res.send(events);
  } catch (error) {
    console.error(error);
    res.status(500).send({
      message: "Failed to get events",
    });
  }
});





app.get('/', (req, res) => {
  res.send('KindNest server is fine!')
})

app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`)
})