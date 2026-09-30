export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured"
      });
    }

    const {
      action = "generate",
      prompt,
      operationName,
      imageBase64,
      mimeType = "image/jpeg",
      aspectRatio = "16:9"
    } = req.body || {};

    const BASE_URL =
      "https://generativelanguage.googleapis.com/v1beta";

    /*
     * CHECK STATUS
     */
    if (action === "status") {
      if (!operationName) {
        return res.status(400).json({
          error: "operationName is required"
        });
      }

      const response = await fetch(
        `${BASE_URL}/${operationName}`,
        {
          method: "GET",
          headers: {
            "x-goog-api-key": apiKey
          }
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json(data);
      }

      /*
       * Still processing
       */
      if (!data.done) {
        return res.status(200).json({
          done: false,
          status: "processing"
        });
      }

      /*
       * Generation finished
       */
      if (data.error) {
        return res.status(200).json({
          done: true,
          status: "failed",
          error: data.error.message || "Video generation failed"
        });
      }

      const video =
        data.response?.generateVideoResponse
          ?.generatedSamples?.[0]?.video;

      if (!video?.uri) {
        return res.status(200).json({
          done: true,
          status: "failed",
          error: "Video URL was not returned by Google"
        });
      }

      return res.status(200).json({
        done: true,
        status: "completed",
        videoUrl: video.uri
      });
    }

    /*
     * START GENERATION
     */
    if (!prompt || prompt.trim().length < 2) {
      return res.status(400).json({
        error: "Please enter a video prompt"
      });
    }

    const instance = {
      prompt: prompt.trim()
    };

    /*
     * Image-to-video
     */
    if (imageBase64) {
      instance.image = {
        bytesBase64Encoded: imageBase64,
        mimeType: mimeType
      };
    }

    const parameters = {
      aspectRatio:
        aspectRatio === "9:16" ? "9:16" : "16:9",
      resolution: "720p",
      numberOfVideos: 1
    };

    const response = await fetch(
      `${BASE_URL}/models/veo-3.1-generate-preview:predictLongRunning`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          instances: [instance],
          parameters
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Google Veo API request failed",
        details: data
      });
    }

    if (!data.name) {
      return res.status(500).json({
        error: "Google did not return an operation name",
        details: data
      });
    }

    return res.status(200).json({
      done: false,
      status: "processing",
      operationName: data.name
    });

  } catch (error) {
    console.error("Veo API error:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Internal server error"
    });
  }
}
