import { GoogleGenAI } from "@google/genai";
import { Theme, GenerationSettings } from '../types';
import { TEXTURE_PROMPTS } from '../constants';

// Initialize the client. The API_KEY is expected to be in the environment.
// In a real-world scenario, this would likely be proxied through a backend to protect the key,
// but for this SPA requirement, we use it directly.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const constructPrompt = (theme: Theme, settings: GenerationSettings): string => {
  const texture = TEXTURE_PROMPTS[settings.textureIntensity];
  
  let layoutPrompt = '';
  switch (settings.pageStyle) {
    case 'Full Page': layoutPrompt = 'A full page seamless background texture'; break;
    case 'Collage': layoutPrompt = 'A mixed media collage layout with layered paper scraps'; break;
    case 'Lined': layoutPrompt = 'A page with faint vintage handwriting lines for journaling'; break;
    case 'Grid': layoutPrompt = 'A page with distressed vintage graph paper grid'; break;
    case 'Ephemera Sheet': layoutPrompt = 'A sheet containing multiple cut-out ephemera items like tags, tickets, and cards'; break;
  }

  const elementsPrompt = settings.elements.length > 0 
    ? `featuring elements: ${settings.elements.join(', ')}` 
    : '';

  const extraDetails = [
    settings.includeFrames ? 'ornate vintage frames' : '',
    settings.includeBorders ? 'decorative borders' : ''
  ].filter(Boolean).join(', ');

  // Construct the final detailed prompt
  return `High quality, 300 DPI, print ready. ${theme.basePrompt}. ${layoutPrompt}. Texture: ${texture}. ${elementsPrompt}. ${extraDetails}. ${theme.styleKeywords.join(', ')} style. Flat lay, top down view, high resolution junk journal printable.`;
};

export const generateJournalPage = async (
  theme: Theme, 
  settings: GenerationSettings
): Promise<string> => {
  try {
    const prompt = constructPrompt(theme, settings);

    // Using gemini-2.5-flash-image for speed or gemini-3-pro-image-preview for quality.
    // Given the prompt asks for "High Quality", we prefer the pro image model if available,
    // otherwise fallback to flash.
    const model = 'gemini-2.5-flash-image'; 

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { text: prompt }
        ]
      },
      // Note: responseMimeType and responseSchema are NOT supported for image models usually
      // We rely on the inlineData in the response.
    });

    // Iterate through parts to find the image
    const parts = response.candidates?.[0]?.content?.parts;
    
    if (parts) {
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const base64Data = part.inlineData.data;
          const mimeType = part.inlineData.mimeType || 'image/png';
          return `data:${mimeType};base64,${base64Data}`;
        }
      }
    }
    
    throw new Error("No image data found in response.");
  } catch (error) {
    console.error("Gemini Image Generation Error:", error);
    throw error;
  }
};
