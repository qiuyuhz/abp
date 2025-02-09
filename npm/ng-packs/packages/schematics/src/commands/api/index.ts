import { normalize } from '@angular-devkit/core';
import {
  applyTemplates,
  branchAndMerge,
  chain,
  move,
  SchematicsException,
  Tree,
  url,
} from '@angular-devkit/schematics';
import { defaultEServiceType, eServiceType, Exception } from '../../enums';
import { Controller, GenerateProxySchema, ServiceGeneratorParams } from '../../models';
import {
  applyWithOverwrite,
  buildTargetPath,
  createControllerToServiceMapper,
  createImportRefsToModelReducer,
  createImportRefToEnumMapper,
  createProxyConfigReader,
  createProxyConfigWriterCreator,
  createRootNamespaceGetter,
  EnumGeneratorParams,
  generateProxyConfigJson,
  getEnumNamesFromImports,
  interpolate,
  ModelGeneratorParams,
  removeDefaultPlaceholders,
  resolveProject,
  sanitizeTypeNames,
  sanitizeControllerTypeNames,
  serializeParameters,
  resolveAbpPackages,
  resolveSelfGenericProps,
} from '../../utils';
import * as cases from '../../utils/text';

export default function (schema: GenerateProxySchema) {
  const params = removeDefaultPlaceholders(schema);
  const moduleName = params.module || 'app';

  return chain([
    async (tree: Tree) => {
      const getRootNamespace = createRootNamespaceGetter(params);
      const solution = await getRootNamespace(tree);

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const target = await resolveProject(tree, params.target!);
      const targetPath = buildTargetPath(target.definition, params.entryPoint);
      const readProxyConfig = createProxyConfigReader(targetPath);
      const createProxyConfigWriter = createProxyConfigWriterCreator(targetPath);
      const data = readProxyConfig(tree);
      data.types = sanitizeTypeNames(data.types);

      resolveSelfGenericProps({ solution, types: data.types });

      const types = data.types;
      const modules = data.modules;
      const serviceType = schema.serviceType || defaultEServiceType;

      if (!types || !modules) {
        throw new SchematicsException(Exception.InvalidApiDefinition);
      }

      const definition = data.modules[moduleName];
      if (!definition) {
        throw new SchematicsException(interpolate(Exception.InvalidModule, moduleName));
      }

      const apiName = definition.remoteServiceName;
      data.modules[moduleName].controllers = sanitizeControllerTypeNames(definition.controllers);

      const controllers = filterControllersByServiceType(
        serviceType,
        data.modules[moduleName].controllers,
      );

      const serviceImports: Record<string, string[]> = {};
      const generateServices = createServiceGenerator({
        targetPath,
        solution,
        types,
        apiName,
        controllers,
        serviceImports,
      });

      const modelImports: Record<string, string[]> = {};
      const generateModels = createModelGenerator({
        targetPath,
        solution,
        types,
        serviceImports,
        modelImports,
      });

      const generateEnums = createEnumGenerator({
        targetPath,
        solution,
        types,
        serviceImports,
        modelImports,
      });

      if (!data.generated.includes(moduleName)) {
        data.generated.push(moduleName);
      }

      data.generated.sort();

      const json = generateProxyConfigJson(data);
      const overwriteProxyConfig = createProxyConfigWriter('overwrite', json);

      return branchAndMerge(
        chain([generateServices, generateModels, generateEnums, overwriteProxyConfig]),
      );
    },
  ]);
}

function createEnumGenerator(params: EnumGeneratorParams) {
  const { targetPath, serviceImports, modelImports } = params;
  const mapImportRefToEnum = createImportRefToEnumMapper(params);
  const enumRefs = [
    ...new Set([
      ...getEnumNamesFromImports(serviceImports),
      ...getEnumNamesFromImports(modelImports),
    ]),
  ];

  return chain(
    enumRefs.map(ref => {
      return applyWithOverwrite(url('./files-enum'), [
        applyTemplates({
          ...cases,
          ...mapImportRefToEnum(ref),
        }),
        move(normalize(targetPath)),
      ]);
    }),
  );
}

function createModelGenerator(params: ModelGeneratorParams) {
  const { targetPath, serviceImports, modelImports } = params;
  const reduceImportRefsToModels = createImportRefsToModelReducer(params);
  const models = Object.values(serviceImports).reduce(reduceImportRefsToModels, []);

  models.forEach(({ imports }) =>
    imports.forEach(({ refs, path }) =>
      refs.forEach(ref => {
        if (path === '@abp/ng.core') {
          return;
        }

        if (!modelImports[path]) {
          return (modelImports[path] = [ref]);
        }

        modelImports[path] = [...new Set([...modelImports[path], ref])];
      }),
    ),
  );

  resolveAbpPackages(models);

  return chain(
    models.map(model =>
      applyWithOverwrite(url('./files-model'), [
        applyTemplates({
          ...cases,
          ...model,
        }),
        move(normalize(targetPath)),
      ]),
    ),
  );
}

function createServiceGenerator(params: ServiceGeneratorParams) {
  const { targetPath, controllers, serviceImports } = params;
  const mapControllerToService = createControllerToServiceMapper(params);

  return chain(
    controllers.map(controller => {
      const service = mapControllerToService(controller);
      service.imports.forEach(({ refs, path }) =>
        refs.forEach(ref => {
          if (path === '@abp/ng.core') return;
          if (!serviceImports[path]) return (serviceImports[path] = [ref]);
          serviceImports[path] = [...new Set([...serviceImports[path], ref])];
        }),
      );

      return applyWithOverwrite(url('./files-service'), [
        applyTemplates({
          ...cases,
          serializeParameters,
          ...service,
        }),
        move(normalize(targetPath)),
      ]);
    }),
  );
}

function filterControllersByServiceType(
  serviceType: string,
  controllers: Record<string, Controller>,
): Controller[] {
  const itShouldBeIntegratedService = serviceType === eServiceType.Integration;
  const skipFilter = serviceType === eServiceType.All;
  return Object.values(controllers || {}).filter(
    x => x.isIntegrationService === itShouldBeIntegratedService || skipFilter,
  );
}
