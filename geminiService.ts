
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
    Nhiệm vụ: Nhận diện sản phẩm từ hình ảnh.
    Dữ liệu kho cửa hàng: ${JSON.stringify(context)}
    
    Yêu cầu:
    1. ĐỐI CHIẾU: Nếu khớp với sản phẩm trong kho > 80%, trả về "productId".
    2. GỢI Ý MỚI: Nếu sản phẩm chưa có trong kho, gợi ý "suggestedName" và "brand" chính xác.
    Phản hồi định dạng JSON.
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
            productId: { type: Type.STRING, description: "ID nếu có trong kho, ngược lại null" },
            confidence: { type: Type.NUMBER, description: "Độ tin cậy 0-1" },
            suggestedName: { type: Type.STRING, description: "Tên sản phẩm gợi ý" },
            brand: { type: Type.STRING, description: "Thương hiệu gợi ý" }
          },
          required: ["productId", "confidence"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error: any) {
    console.error("AI Error:", error);
    return { productId: null, confidence: 0 };
  }
};
