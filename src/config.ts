import dotenv from "dotenv";
dotenv.config();
export interface Account {
  id: string;
  privateKey: string;
}

export const accounts: Account[] = [
  {
    id: "0.0.5613562",
    privateKey:
      "302e020100300506032b657004220420574889151e846e902eeebbe8f248b304f0a70bd12e42bb1163dbaf4bf26fc0cd",
  },
  {
    id: "0.0.5613563",
    privateKey:
      "302e020100300506032b657004220420e362beab10425525818cf933936f51a382dc00968ee9ec7fed452a8d1924c87b",
  },
  {
    id: "0.0.5649190",
    privateKey:
      "a7e570057109c797e861e70bcce23167568cd22ca85f30aadd212e25022de4de",
  },
  {
    id: "0.0.5649215",
    privateKey:
      "f23e4ebadd0e34069044e6739186d642dc82395c810cd47af6f32bde7e8145d0",
  },
  {
    id: "0.0.5649223",
    privateKey:
      "115ef4c5e20325238e7ec1f04b85c76ab8eb2a314d512153b8a087d35da922bc",
  },
];

export const mainAccount: Account = {
  id: process.env.MY_ACCOUNT_ID || "",
  privateKey: process.env.MY_PRIVATE_KEY || "",
};
