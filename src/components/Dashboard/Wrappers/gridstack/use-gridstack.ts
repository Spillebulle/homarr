import { GridStack, GridStackNode } from 'fily-publish-gridstack';
import {
  createRef,
  MutableRefObject,
  RefObject,
  useEffect, useMemo,
  useRef,
} from 'react';
import { useConfigContext } from '../../../../config/provider';
import { useConfigStore } from '../../../../config/store';
import { AppType } from '../../../../types/app';
import { AreaType } from '../../../../types/area';
import { IWidget } from '../../../../widgets/widgets';
import { useEditModeStore } from '../../Views/useEditModeStore';
import { initializeGridstack } from './init-gridstack';
import { useGridstackStore, useWrapperColumnCount } from './store';

interface UseGristackReturnType {
  apps: AppType[];
  widgets: IWidget<string, any>[];
  refs: {
    wrapper: RefObject<HTMLDivElement>;
    items: MutableRefObject<Record<string, RefObject<HTMLDivElement>>>;
    gridstack: MutableRefObject<GridStack | undefined>;
  };
}

export const useGridstack = (
  areaType: 'wrapper' | 'category' | 'sidebar',
  areaId: string
): UseGristackReturnType => {
  const isEditMode = useEditModeStore((x) => x.enabled);
  const { config, configVersion, name: configName } = useConfigContext();
  const updateConfig = useConfigStore((x) => x.updateConfig);
  // define reference for wrapper - is used to calculate the width of the wrapper
  const wrapperRef = useRef<HTMLDivElement>(null);
  // references to the diffrent items contained in the gridstack
  const itemRefs = useRef<Record<string, RefObject<HTMLDivElement>>>({});
  // reference of the gridstack object for modifications after initialization
  const gridRef = useRef<GridStack>();
  const wrapperColumnCount = useWrapperColumnCount();
  const shapeSize = useGridstackStore(x => x.currentShapeSize);
  const mainAreaWidth = useGridstackStore(x => x.mainAreaWidth);
  // width of the wrapper (updating on page resize)
  const root: HTMLHtmlElement = useMemo(() => document.querySelector(':root')!, []);

  if (!mainAreaWidth || !shapeSize || !wrapperColumnCount) throw new Error('UseGridstack should not be executed before mainAreaWidth has been set!');

  const items = useMemo(
    () =>
      config?.apps.filter(
        (x) =>
          x.area.type === areaType &&
          (x.area.type === 'sidebar'
            ? x.area.properties.location === areaId
            : x.area.properties.id === areaId)
      ) ?? [],
    [configVersion, config?.apps.length]
  );
  const widgets = useMemo(() => {
    if (!config) return [];
    return config.widgets.filter(
      (w) =>
        w.area.type === areaType &&
        (w.area.type === 'sidebar'
          ? w.area.properties.location === areaId
          : w.area.properties.id === areaId)
    );
  }, [configVersion, config?.widgets.length]);

  // define items in itemRefs for easy access and reference to items
  if (Object.keys(itemRefs.current).length !== items.length + (widgets ?? []).length) {
    items.forEach(({ id }: { id: keyof typeof itemRefs.current }) => {
      itemRefs.current[id] = itemRefs.current[id] || createRef();
    });
    (widgets ?? []).forEach(({ id }) => {
      itemRefs.current[id] = itemRefs.current[id] || createRef();
    });
  }

  useEffect(() => {
    const widgetWidth = mainAreaWidth / wrapperColumnCount;
    // widget width is used to define sizes of gridstack items within global.scss
    // TODO: improve
    root.style.setProperty('--gridstack-widget-width', widgetWidth.toString());
    root.style.setProperty('--gridstack-column-count', wrapperColumnCount.toString());
    gridRef.current?.cellHeight(widgetWidth);
  }, [mainAreaWidth, wrapperColumnCount]);

  const onChange = isEditMode
    ? (changedNode: GridStackNode) => {
        if (!configName) return;

        const itemType = changedNode.el?.getAttribute('data-type');
        const itemId = changedNode.el?.getAttribute('data-id');
        if (!itemType || !itemId) return;

        // Updates the config and defines the new position of the item
        updateConfig(configName, (previous) => {
          const currentItem =
            itemType === 'app'
              ? previous.apps.find((x) => x.id === itemId)
              : previous.widgets.find((x) => x.id === itemId);
          if (!currentItem) return previous;

          currentItem.shape[shapeSize] = {
            location: {
              x: changedNode.x ?? currentItem.shape[shapeSize].location.x,
              y: changedNode.y ?? currentItem.shape[shapeSize].location.y,
            },
            size: {
              width: changedNode.w ?? currentItem.shape[shapeSize].size.width,
              height: changedNode.h ?? currentItem.shape[shapeSize].size.height,
            },
          };

          if (itemType === 'app') {
            return {
              ...previous,
              apps: [
                ...previous.apps.filter((x) => x.id !== itemId),
                { ...(currentItem as AppType) },
              ],
            };
          }

          return {
            ...previous,
            widgets: [
              ...previous.widgets.filter((x) => x.id !== itemId),
              { ...(currentItem as IWidget<string, any>) },
            ],
          };
        });
      }
    : () => {};

  const onAdd = isEditMode
    ? (addedNode: GridStackNode) => {
        if (!configName) return;

        const itemType = addedNode.el?.getAttribute('data-type');
        const itemId = addedNode.el?.getAttribute('data-id');
        if (!itemType || !itemId) return;

        // Updates the config and defines the new position and wrapper of the item
        updateConfig(
          configName,
          (previous) => {
            const currentItem =
              itemType === 'app'
                ? previous.apps.find((x) => x.id === itemId)
                : previous.widgets.find((x) => x.id === itemId);
            if (!currentItem) return previous;

            if (areaType === 'sidebar') {
              currentItem.area = {
                type: areaType,
                properties: {
                  location: areaId as 'right' | 'left',
                },
              };
            } else {
              currentItem.area = {
                type: areaType,
                properties: {
                  id: areaId,
                },
              };
            }

            currentItem.shape[shapeSize] = {
              location: {
                x: addedNode.x ?? currentItem.shape[shapeSize].location.x,
                y: addedNode.y ?? currentItem.shape[shapeSize].location.y,
              },
              size: {
                width: addedNode.w ?? currentItem.shape[shapeSize].size.width,
                height: addedNode.h ?? currentItem.shape[shapeSize].size.height,
              },
            };

            if (itemType === 'app') {
              return {
                ...previous,
                apps: [
                  ...previous.apps.filter((x) => x.id !== itemId),
                  { ...(currentItem as AppType) },
                ],
              };
            }

            return {
              ...previous,
              widgets: [
                ...previous.widgets.filter((x) => x.id !== itemId),
                { ...(currentItem as IWidget<string, any>) },
              ],
            };
          },
          (prev, curr) => {
            const isApp = itemType === 'app';

            if (isApp) {
              const currItem = curr.apps.find((x) => x.id === itemId);
              const prevItem = prev.apps.find((x) => x.id === itemId);
              if (!currItem || !prevItem) return false;

              return (
                currItem.area.type !== prevItem.area.type ||
                Object.entries(currItem.area.properties).some(
                  ([key, value]) =>
                    prevItem.area.properties[key as keyof AreaType['properties']] !== value
                )
              );
            }

            const currItem = curr.widgets.find((x) => x.id === itemId);
            const prevItem = prev.widgets.find((x) => x.id === itemId);
            if (!currItem || !prevItem) return false;

            return (
              currItem.area.type !== prevItem.area.type ||
              Object.entries(currItem.area.properties).some(
                ([key, value]) =>
                  prevItem.area.properties[key as keyof AreaType['properties']] !== value
              )
            );
          }
        );
      }
    : () => {};

  // initialize the gridstack
  useEffect(() => {
    initializeGridstack(
      areaType,
      wrapperRef,
      gridRef,
      itemRefs,
      areaId,
      items,
      widgets ?? [],
      isEditMode,
      wrapperColumnCount,
      shapeSize,
      {
        onChange,
        onAdd,
      }
    );
  }, [items, wrapperRef.current, widgets, wrapperColumnCount]);

  return {
    apps: items,
    widgets: widgets ?? [],
    refs: {
      items: itemRefs,
      wrapper: wrapperRef,
      gridstack: gridRef,
    },
  };
};
