
import { GoogleGenAI, Type } from "@google/genai";
import { Product, ScanResult } from "./types";

export const searchProductByImage = async (
  base64Image: string,
  existingProducts: Product[]
): Promise<ScanResult> => {
  // Sử dụng API Key từ môi trường theo quy định
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const context = existingProducts.map(p => ({
    id: p.id,
    name: p.name,
    price: p.sellingPrice
  }));

  const prompt = `
    Nhiệm vụ: Nhận diện sản phẩm từ hình ảnh được cung cấp.
    Dữ liệu kho hiện tại: ${JSON.stringify(context)}
    
    Hướng dẫn:
    1. Phân tích văn bản, nhãn hiệu và đặc điểm ngoại quan trong ảnh.
    2. So khớp với dữ liệu kho. Nếu khớp > 80%, trả về productId.
    3. Nếu không tìm thấy trong kho, hãy gợi ý một tên sản phẩm chính xác dựa trên những gì bạn thấy.
    
    Trả về định dạng JSON nghiêm ngặt.
  `;

  try {
    const imageData = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

    // Sử dụng gemini-3-flash-preview: Mô hình Flash tiên tiến nhất với RPD tối ưu
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
            productId: { type: Type.STRING, description: "ID sản phẩm trong kho hoặc null" },
            confidence: { type: Type.NUMBER, description: "Độ tin cậy từ 0.0 đến 1.0" },
            suggestedName: { type: Type.STRING, description: "Tên gợi ý nếu không có ID" },
            description: { type: Type.STRING, description: "Lý do nhận diện" }
          },
          required: ["productId", "confidence"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) throw new Error("AI không phản hồi");

    return JSON.parse(resultText);
  } catch (error: any) {
    console.error("Gemini AI Error:", error);
    // Xử lý lỗi hạn mức một cách thân thiện
    if (error.message?.includes("429")) {
      throw new Error("Hệ thống đang bận do hạn mức API. Vui lòng thử lại sau giây lát.");
    }
    throw new Error("Lỗi nhận diện hình ảnh. Vui lòng thử lại.");
  }
};
