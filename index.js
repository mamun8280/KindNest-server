
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const PORT = 8000;

// Middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(express.json());

// MongoDB Connection
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();

const db = client.db("kindnest");

const ManageEventcollection = db.collection("ManageEvents");
const JoinedEventscollection = db.collection("JoinedEvents");

// Prevent Duplicate Join
await JoinedEventscollection.createIndex(
  { eventId: 1, userEmail: 1 },
  { unique: true }
);

// JWT Authentication
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
);

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({
      message: "Unauthorized! Please login.",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const { payload } = await jwtVerify(token, JWKS);

    req.user = payload;

    if (!req.user.email) {
      return res.status(401).send({
        message: "User email not found in token.",
      });
    }

    next();
  } catch (error) {
    console.error("Token Verification Error:", error);

    return res.status(401).send({
      message: "Invalid or expired token.",
    });
  }
};

// CREATE EVENT
app.post("/create-event", verifyToken, async (req, res) => {
  try {
    const {
      eventTitle,
      eventType,
      eventDate,
      location,
      imageUrl,
      description,
    } = req.body;

    if (
      !eventTitle?.trim() ||
      !eventType?.trim() ||
      !eventDate ||
      !location?.trim() ||
      !imageUrl?.trim() ||
      !description?.trim()
    ) {
      return res.status(400).send({
        success: false,
        message: "Please provide all required information.",
      });
    }

    const eventData = {
      eventTitle: eventTitle.trim(),
      eventType: eventType.trim(),
      eventDate,
      location: location.trim(),
      imageUrl: imageUrl.trim(),
      description: description.trim(),
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

// UPCOMING EVENTS
app.get("/upcoming-events", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const events = await ManageEventcollection
      .find({ eventDate: { $gte: today } })
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

// MANAGE EVENTS - OWN EVENTS
app.get("/ManageEvents", verifyToken, async (req, res) => {
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

// EVENT DETAILS
app.get("/ManageEvents/:id",verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid event ID.",
      });
    }

    const event = await ManageEventcollection.findOne({
      _id: new ObjectId(id),
    });

    if (!event) {
      return res.status(404).send({
        message: "Event not found.",
      });
    }

    res.send(event);
  } catch (error) {
    console.error("Event Details Error:", error);

    res.status(500).send({
      message: "Failed to get event details.",
    });
  }
});

// JOIN EVENT
app.post("/join-event/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid event ID.",
      });
    }

    const event = await ManageEventcollection.findOne({
      _id: new ObjectId(id),
    });

    if (!event) {
      return res.status(404).send({
        message: "Event not found.",
      });
    }

    if (event.creatorEmail === req.user.email) {
      return res.status(400).send({
        message: "You cannot join your own event.",
      });
    }

    await JoinedEventscollection.insertOne({
      eventId: event._id,
      eventTitle: event.eventTitle,
      userEmail: req.user.email,
      joinedAt: new Date().toISOString(),
    });

    res.status(201).send({
      success: true,
      message: "You have successfully joined this event!",
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).send({
        message: "You have already joined this event.",
      });
    }

    console.error("Join Event Error:", error);

    res.status(500).send({
      message: "Failed to join event.",
    });
  }
});

// CHECK JOIN STATUS
app.get("/joined-events/:id", verifyToken, async (req, res) => {
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
    console.error("Join Status Error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to check joined status.",
    });
  }
});

// JOINED EVENTS
app.get("/joined-events", verifyToken, async (req, res) => {
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
      message: "Failed to get joined events.",
    });
  }
});

// LEAVE EVENT
app.delete("/leave-event/:id", verifyToken, async (req, res) => {
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
      message: "You have successfully left the event!",
    });
  } catch (error) {
    console.error("Leave Event Error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to leave event.",
    });
  }
});

// EDIT EVENT - OWNER ONLY
app.patch("/ManageEvents/:id", verifyToken, async (req, res) => {
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

    if (updateData.eventTitle !== undefined) {
      await JoinedEventscollection.updateMany(
        { eventId: new ObjectId(id) },
        { $set: { eventTitle: updateData.eventTitle } }
      );
    }

    res.send({
      success: true,
      message: "Event updated successfully!",
    });
  } catch (error) {
    console.error("Edit Event Error:", error);

    res.status(500).send({
      message: "Failed to update event.",
    });
  }
});

// DELETE EVENT - OWNER ONLY
app.delete("/ManageEvents/:id", verifyToken, async (req, res) => {
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

// ROOT ROUTE
app.get("/", (req, res) => {
  res.send("KindNest server is fine!");
});

// START SERVER
app.listen(PORT, () => {
  console.log(`KindNest server listening on port ${PORT}`);
});
