import { config } from "dotenv";

// Carga .env.test SIN sobrescribir variables ya presentes (permite BD por-runner).
config({ path: ".env.test" });
