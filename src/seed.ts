import { connectToDatabase, closeDatabase } from "./config/db.js";
import { StudioDocument } from "./models/studio.model.js";
import { ObjectId } from "mongodb";
import crypto from "crypto";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

export const SEED_STUDIOS: Partial<StudioDocument>[] = [
  {
    title: "The Daylight Loft & Cyclorama",
    category: "Photo Studio",
    hourlyRate: 85,
    securityDeposit: 150,
    maxCapacity: 25,
    location: "420 Industrial Ave, Arts District, Brooklyn, NY",
    imageUrl: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1520607164069-c5b0425836c7?auto=format&fit=crop&w=1200&q=80"
    ],
    amenities: [
      "18ft Seamless White Cyc Wall",
      "North-Facing Floor-to-Ceiling Windows",
      "Profoto D2 Lighting Kit",
      "Full Hair & Makeup Station",
      "Mobile Steamer & Wardrobe Racks",
      "High-Speed Fiber WiFi (1 Gbps)"
    ],
    overview: "A 2,800 sq ft daylight loft featuring an immaculate 18ft corner cyclorama and massive factory sash windows. Flooded with natural diffused northern light throughout the day, this space is ideal for editorial fashion, lookbooks, portraiture, and commercial campaigns.",
    rating: 4.95,
    reviewCount: 38,
    status: "active",
  },
  {
    title: "Apex Soundstage & Motion Stage",
    category: "Sound Stage",
    hourlyRate: 160,
    securityDeposit: 300,
    maxCapacity: 60,
    location: "880 Production Way, Studio City, Los Angeles, CA",
    imageUrl: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=1200&q=80"
    ],
    amenities: [
      "Acoustically Soundproofed Stage (NC-25)",
      "Drive-In Elephant Door",
      "400A 3-Phase Camlock Power",
      "Pre-Rigged Overhead Lighting Grid",
      "Green Screen Chroma Wall (30ft)",
      "Dedicated Production Office & Green Room"
    ],
    overview: "Purpose-built motion picture stage engineered for dialogue capture, music videos, commercials, and virtual productions. Features silent air conditioning, high-load steel grid, and heavy power distribution.",
    rating: 4.98,
    reviewCount: 52,
    status: "active",
  },
  {
    title: "The Broadcast Pod Lounge",
    category: "Podcast Lounge",
    hourlyRate: 65,
    securityDeposit: 100,
    maxCapacity: 8,
    location: "150 Michigan Avenue, Loop, Chicago, IL",
    imageUrl: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&w=1200&q=80"
    ],
    amenities: [
      "4x Shure SM7B Broadcast Mics",
      "Rodecaster Pro II Console",
      "Sony FX3 4K Multi-Cam System",
      "Acoustic Wood Slat Paneling",
      "Live Streaming Switcher (ATEM Mini)",
      "Custom Neon & RGB Ambience Lighting"
    ],
    overview: "Turnkey podcast and vodcast studio with acoustic treatment and warm mid-century modern aesthetic. Equipped with broadcast-grade audio, 4K multi-camera switching, and zero-latency monitoring for seamless recording or livestreaming.",
    rating: 4.92,
    reviewCount: 29,
    status: "active",
  },
  {
    title: "Velvet Analog Recording Suite",
    category: "Music Suite",
    hourlyRate: 110,
    securityDeposit: 200,
    maxCapacity: 12,
    location: "710 Music Row, Nashville, TN",
    imageUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80"
    ],
    amenities: [
      "Neve 8424 Recording Console",
      "Genelec 8351B Smart Active Monitors",
      "Vintage Tube Microphones (Neumann U87, Telefunken)",
      "Isolated Live Vocal Booth",
      "Universal Audio Apollo x16",
      "Yamaha C7 Grand Piano"
    ],
    overview: "Elite mixing, tracking, and vocal production room treated to golden acoustic standards. Blends warm analog outboard gear with the latest digital tools, offering producers and vocalists an inspiring creative enclave.",
    rating: 4.96,
    reviewCount: 44,
    status: "active",
  },
  {
    title: "Atelier Industrial Creative Lab",
    category: "Workshop",
    hourlyRate: 75,
    securityDeposit: 120,
    maxCapacity: 35,
    location: "310 Mission St, SOMA, San Francisco, CA",
    imageUrl: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80"
    ],
    amenities: [
      "Polished Concrete Worktables",
      "Natural Skylights & Dimmable Tracks",
      "Industrial Utility Sink & Wash Station",
      "Heavy Duty Power Drops",
      "Gallery Hanging Rail System",
      "Coffee & Refreshment Bar"
    ],
    overview: "Spacious multidisciplinary creative workshop space with soaring ceilings and raw concrete architecture. Built for set construction, art fabrication, design sprints, prototype testing, and tactile masterclasses.",
    rating: 4.88,
    reviewCount: 22,
    status: "active",
  },
  {
    title: "Komorebi Minimalist Photo Studio",
    category: "Photo Studio",
    hourlyRate: 90,
    securityDeposit: 150,
    maxCapacity: 20,
    location: "205 Pioneer Square, Seattle, WA",
    imageUrl: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=1200&q=80"
    ],
    amenities: [
      "Japandi Wooden Architectural Accents",
      "Custom Textured Canvas Backdrops",
      "Aputure 600d Pro Continuous Lights",
      "Private Dressing & Lounge Suite",
      "Bluetooth Sound System",
      "Gourmet Espresso Machine"
    ],
    overview: "Inspired by Japanese aesthetics and wabi-sabi architecture, this serene studio is curated with limestone plaster textures, custom modular plinths, and warm organic materials. Perfect for high-end product photography, beauty, and mindful content.",
    rating: 4.97,
    reviewCount: 31,
    status: "active",
  },
  {
    title: "Metropolis High-Ceiling Soundstage",
    category: "Sound Stage",
    hourlyRate: 180,
    securityDeposit: 350,
    maxCapacity: 80,
    location: "550 Broad Street, Downtown, Atlanta, GA",
    imageUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80"
    ],
    amenities: [
      "24ft Clear Ceiling Height",
      "Double-Wall Sound Attenuation",
      "Motorized Scissor Lift Onsite",
      "Catering Prep Kitchen",
      "Multi-Line Intercom System",
      "Secure VIP Talent Trailer Parking"
    ],
    overview: "Comprehensive production stage built for narrative television, feature films, and high-impact commercial productions. Includes dedicated hair/makeup suites, client lounge with live stage feeds, and whisper-quiet HVAC.",
    rating: 4.99,
    reviewCount: 65,
    status: "active",
  },
  {
    title: "Studio Resonance Live Room",
    category: "Music Suite",
    hourlyRate: 125,
    securityDeposit: 220,
    maxCapacity: 15,
    location: "92 Austin City Limits Blvd, Austin, TX",
    imageUrl: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1200&q=80",
    gallery: [
      "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1200&q=80"
    ],
    amenities: [
      "Solid Maple Acoustic Diffusers",
      "Vintage Marshall & Fender Tube Amps",
      "Ludwig Classic Oak Drum Kit",
      "Avid Pro Tools HDX Rig",
      "Private Artist Patio",
      "Cold Brew on Tap"
    ],
    overview: "A vibrant live tracking studio with customizable acoustics and vintage backline instruments ready to plug and play. Legendary warmth for indie bands, session players, and soundtrack scoring.",
    rating: 4.94,
    reviewCount: 37,
    status: "active",
  }
];

export async function seedDatabase() {
  console.log("[Seed] Starting database seed...");
  const db = await connectToDatabase();

  const userCollection = db.collection("user");
  const accountCollection = db.collection("account");
  const studioCollection = db.collection("studios");

  // 1. Create or ensure Examiner Test Account (StudioSpace primary + ShootLocation alias)
  const examinerEmail = "examiner@studiospace.com";
  const legacyEmail = "examiner@shootlocation.com";

  let hostUser: any = await userCollection.findOne({
    $or: [{ email: examinerEmail }, { email: legacyEmail }],
  });

  if (!hostUser) {
    const hostId = "examiner-host-user-id-01";
    const newHost = {
      _id: new ObjectId(),
      id: hostId,
      name: "Examiner Host",
      email: examinerEmail,
      emailVerified: true,
      image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await userCollection.insertOne(newHost as any);
    await accountCollection.insertOne({
      _id: new ObjectId(),
      id: crypto.randomUUID(),
      userId: hostId,
      accountId: hostId,
      providerId: "credential",
      password: hashPassword("ExaminerPassword123!"),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    // Also seed legacy email alias for evaluator flexibility
    const legacyHost = {
      _id: new ObjectId(),
      id: "examiner-legacy-host-02",
      name: "Examiner Host",
      email: legacyEmail,
      emailVerified: true,
      image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await userCollection.insertOne(legacyHost as any);
    await accountCollection.insertOne({
      _id: new ObjectId(),
      id: crypto.randomUUID(),
      userId: "examiner-legacy-host-02",
      accountId: "examiner-legacy-host-02",
      providerId: "credential",
      password: hashPassword("ExaminerPassword123!"),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    hostUser = newHost;
    console.log("[Seed] Created Examiner Test Accounts: examiner@studiospace.com / ExaminerPassword123!");
  } else {
    console.log("[Seed] Examiner Test Account already exists.");
  }

  const hostId = hostUser?.id || hostUser?._id?.toString() || "examiner-host-user-id-01";

  // 2. Check existing studios
  const existingCount = await studioCollection.countDocuments();
  if (existingCount === 0) {
    const studiosToInsert = SEED_STUDIOS.map((s) => ({
      ...s,
      hostId: hostId,
      hostName: hostUser?.name || "Examiner Host",
      hostEmail: examinerEmail,
      hostImage: hostUser?.image,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await studioCollection.insertMany(studiosToInsert as any);
    console.log(`[Seed] Successfully inserted ${studiosToInsert.length} creative studios.`);
  } else {
    console.log(`[Seed] Studios collection already contains ${existingCount} listings. Skipping studio insertion.`);
  }

  console.log("[Seed] Seeding completed successfully.");
}

// If run directly
if (process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js")) {
  seedDatabase()
    .then(async () => {
      await closeDatabase();
      process.exit(0);
    })
    .catch((err) => {
      console.error("[Seed] Error seeding database:", err);
      process.exit(1);
    });
}
