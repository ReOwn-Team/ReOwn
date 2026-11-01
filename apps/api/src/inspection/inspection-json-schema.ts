import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { z } from "zod";
import {
    extendZodWithOpenApi,
    OpenAPIRegistry,
    OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { inspectionReportSchema } from "./inspection-report";

// Derive the provider contract from the same schema used to validate reports.
// OpenAPI 3.1 Schema Objects use JSON Schema, unlike the 3.0 exporter.
extendZodWithOpenApi(z);
const registry = new OpenAPIRegistry();
registry.register("InspectionReport", inspectionReportSchema);
export const inspectionJsonSchema = new OpenApiGeneratorV31(
    registry.definitions,
).generateComponents().components!.schemas!.InspectionReport;

export function inspectionJsonSchemaForImages(imageIds: string[]) {
    // Each request owns its enum. Mutating the shared schema could make one
    // listing reference another listing's photos under concurrent inspection.
    const schema = structuredClone(inspectionJsonSchema) as SchemaObject;
    for (const field of [
        "productObservations",
        "visibleDefects",
        "imageQuality",
        "inconsistencies",
    ]) {
        const array = schema.properties![field] as SchemaObject;
        const finding = array.items as SchemaObject;
        const references = finding.properties!.imageIds as SchemaObject;
        references.items = {
            type: "string",
            format: "uuid",
            enum: [...imageIds],
        };
    }
    return schema;
}
