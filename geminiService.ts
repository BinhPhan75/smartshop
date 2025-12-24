
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
    
    Yêu cầu chi tiết:
    1. PHÂN TÍCH VĂN BẢN & LOGO: Đọc các nhãn hiệu, logo, tên xuất hiện trên bao bì.
    2. SO KHỚP DANH SÁCH: Nếu khớp với sản phẩm trong kho > 80%, trả về "productId" tương ứng.
    3. GỢI Ý SẢN PHẨM MỚI: Nếu là sản phẩm chưa có, hãy gợi ý "suggestedName" (Tên SP đầy đủ) và "brand" (Thương hiệu chính xác nhất của hãng).
    
    Trả về định dạng JSON nghiêm ngặt.
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
            brand: { type: Type.STRING, description: "Thương hiệu gợi ý" },
            description: { type: Type.STRING, description: "Lý do nhận diện" }
          },
          required: ["productId", "confidence"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("AI không phản hồi");
    return JSON.parse(text);
  } catch (error: any) {
    console.error("AI Error:", error);
    return { productId: null, confidence: 0 };
  }
};
