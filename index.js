
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";

const app = express();
const PORT = 8000;

// Middleware
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());

// MongoDB Connection
const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
    throw error;
  }
}

const mongoclient = await connectToMongoDB();
const db = mongoclient.db("kindnest");

const ManageEventcollection = db.collection("ManageEvents");
const JoinedEventscollection = db.collection("JoinedEvents");

// Prevent duplicate Join
await JoinedEventscollection.createIndex(
  { eventId: 1, userEmail: 1 },
  { unique: true }
);

// =====================================
// Authentication Middleware
// =====================================

async function verifyUser(req, res, next) {
  try {
    const response = await fetch(
      "http://localhost:3000/api/auth/get-session",
      {
        method: "GET",
        headers: {
          cookie: req.headers.cookie || "",
        },
      }
    );

    if (!response.ok) {
      return res.status(401).send({
        success: false,
        message: "Please login first.",
      });
    }

    const sessionData = await response.json();

    if (!sessionData?.user?.email) {
      return res.status(401).send({
        success: false,
        message: "Unauthorized. Please login first.",
      });
    }

    req.user = sessionData.user;
    next();
  } catch (error) {
    console.error("Authentication Error:", error);

    return res.status(500).send({
      success: false,
      message: "Authentication verification failed.",
    });
  }
}

// =====================================
// Create Event (Private)
// =====================================

app.post("/create-event", verifyUser, async (req, res) => {
  try {
    const data = req.body;

    const eventData = {
      ...data,
      creatorEmail: req.user.email,
      createdAt: new Date().toISOString(),
    };

    const result = await ManageEventcollection.insertOne(eventData);

    res.status(201).send({
      success: true,
      message: "Event created successfully!",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Create Event Error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to create event.",
    });
  }
});

// =====================================
// Upcoming Events (Public)
// =====================================

app.get("/upcoming-events", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const events = await ManageEventcollection
      .find({
        eventDate: { $gte: today },
      })
      .sort({ eventDate: 1 })
      .toArray();

    res.send(events);
  } catch (error) {
    console.error("Upcoming Events Error:", error);

    res.status(500).send({
      message: "Failed to get upcoming events.",
    });
  }
});

// =====================================
// Manage Events (Private)
// =====================================

app.get("/ManageEvents", verifyUser, async (req, res) => {
  try {
    const events = await ManageEventcollection
      .find({ creatorEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(events);
  } catch (error) {
    console.error("Manage Events Error:", error);

    res.status(500).send({
      message: "Failed to get your events.",
    });
  }
});

// =====================================
// Event Details (Public)
// =====================================

app.get("/ManageEvents/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid event ID.",
      });
    }

    const result = await ManageEventcollection.findOne({
      _id: new ObjectId(id),
    });

    if (!result) {
      return res.status(404).send({
        message: "Event not found.",
      });
    }

    res.send(result);
  } catch (error) {
    console.error("Event Details Error:", error);

    res.status(500).send({
      message: "Failed to get event details.",
    });
  }
});

// =====================================
// Join Event (Private)
// =====================================

app.post("/join-event/:id", verifyUser, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid event ID.",
      });
    }

    const event = await ManageEventcollection.findOne({
      _id: new ObjectId(id),
    });

    if (!event) {
      return res.status(404).send({
        success: false,
        message: "Event not found.",
      });
    }

    // Event owner cannot join own event
    if (event.creatorEmail === req.user.email) {
      return res.status(400).send({
        success: false,
        message: "You cannot join your own event.",
      });
    }

    const joinedData = {
      eventId: event._id,
      eventTitle: event.eventTitle,
      userEmail: req.user.email,
      joinedAt: new Date().toISOString(),
    };

    await JoinedEventscollection.insertOne(joinedData);

    res.status(201).send({
      success: true,
      message: "You have successfully joined this event!",
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).send({
        success: false,
        message: "You have already joined this event.",
      });
    }

    console.error("Join Event Error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to join event.",
    });
  }
});

// =====================================
// Check Joined Status (Private)
// =====================================

app.get("/joined-events/:id", verifyUser, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid event ID.",
      });
    }

    const joinedEvent = await JoinedEventscollection.findOne({
      eventId: new ObjectId(id),
      userEmail: req.user.email,
    });

    res.send({
      success: true,
      joined: !!joinedEvent,
    });
  } catch (error) {
    console.error("Check Joined Status Error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to check joined status.",
    });
  }
});

// =====================================
// Joined Events (Private)
// Sort by Event Date (Ascending)
// =====================================

app.get("/joined-events", verifyUser, async (req, res) => {
  try {
    const joinedRecords = await JoinedEventscollection
      .find({ userEmail: req.user.email })
      .toArray();

    const joinedEvents = await Promise.all(
      joinedRecords.map(async (record) => {
        const event = await ManageEventcollection.findOne({
          _id: record.eventId,
        });

        if (!event) return null;

        return {
          ...event,
          joinedAt: record.joinedAt,
        };
      })
    );

    const sortedEvents = joinedEvents
      .filter(Boolean)
      .sort(
        (a, b) =>
          new Date(a.eventDate).getTime() -
          new Date(b.eventDate).getTime()
      );

    res.send(sortedEvents);
  } catch (error) {
    console.error("Joined Events Error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to get joined events.",
    });
  }
});

// =====================================
// Leave Event (Private)
// Delete only current user's Join record
// =====================================

app.delete("/leave-event/:id", verifyUser, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid event ID.",
      });
    }

    const result = await JoinedEventscollection.deleteOne({
      eventId: new ObjectId(id),
      userEmail: req.user.email,
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        success: false,
        message: "You have not joined this event.",
      });
    }

    res.send({
      success: true,
      message: "You have successfully left the event.",
    });
  } catch (error) {
    console.error("Leave Event Error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to leave event.",
    });
  }
});

// =====================================
// Edit Event (Private)
// Only event owner can edit
// =====================================

app.patch("/ManageEvents/:id", verifyUser, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid event ID.",
      });
    }

    const allowedFields = [
      "eventTitle",
      "eventType",
      "eventDate",
      "location",
      "imageUrl",
      "description",
    ];

    const updateData = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).send({
        message: "No valid fields to update.",
      });
    }

    const result = await ManageEventcollection.updateOne(
      {
        _id: new ObjectId(id),
        creatorEmail: req.user.email,
      },
      {
        $set: updateData,
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        message: "Event not found or you are not the owner.",
      });
    }

    // Update saved event title in JoinedEvents
    if (updateData.eventTitle !== undefined) {
      await JoinedEventscollection.updateMany(
        { eventId: new ObjectId(id) },
        { $set: { eventTitle: updateData.eventTitle } }
      );
    }

    res.send({
      success: true,
      message: "Event updated successfully!",
      result,
    });
  } catch (error) {
    console.error("Edit Event Error:", error);

    res.status(500).send({
      message: "Failed to update event.",
    });
  }
});

// =====================================
// Delete Event (Private)
// Only event owner can delete
// =====================================

app.delete("/ManageEvents/:id", verifyUser, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid event ID.",
      });
    }

    const result = await ManageEventcollection.deleteOne({
      _id: new ObjectId(id),
      creatorEmail: req.user.email,
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        message: "Event not found or you are not the owner.",
      });
    }

    // Delete related join records
    await JoinedEventscollection.deleteMany({
      eventId: new ObjectId(id),
    });

    res.send({
      success: true,
      message: "Event deleted successfully!",
    });
  } catch (error) {
    console.error("Delete Event Error:", error);

    res.status(500).send({
      message: "Failed to delete event.",
    });
  }
});

// =====================================
// Root Route
// =====================================

app.get("/", (req, res) => {
  res.send("KindNest server is fine!");
});

// Start Server
app.listen(PORT, () => {
  console.log(`KindNest server listening on port ${PORT}`);
});
