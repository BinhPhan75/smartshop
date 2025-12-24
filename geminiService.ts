
import { GoogleGenAI, Type } from "@google/genai";
import { Product, ScanResult } from "./types";

export const searchProductByImage = async (
  base64Image: string,
  existingProducts: Product[]
): Promise<ScanResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const context = existingProducts.map(p => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    price: p.sellingPrice
  }));

  const prompt = `
    Nhiệm vụ: Nhận diện sản phẩm và thương hiệu từ hình ảnh sản phẩm.
    Dữ liệu kho hiện có: ${JSON.stringify(context)}
    
    Yêu cầu:
    1. Phân tích văn bản, logo và bao bì.
    2. Nếu khớp sản phẩm trong kho > 80%, trả về "productId".
    3. Nếu là sản phẩm mới, hãy gợi ý "suggestedName" (Tên SP) và "brand" (Thương hiệu/Hãng sản xuất) chính xác nhất.
    
    Trả về JSON.
  `;

  try {
    const imageData = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: imageData } }
        ]
      }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            productId: { type: Type.STRING, description: "ID nếu có trong kho" },
            confidence: { type: Type.NUMBER },
            suggestedName: { type: Type.STRING },
            brand: { type: Type.STRING },
            description: { type: Type.STRING }
          },
          required: ["productId", "confidence"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error: any) {
    console.error("AI Error:", error);
    return { productId: null, confidence: 0 };
  }
};
